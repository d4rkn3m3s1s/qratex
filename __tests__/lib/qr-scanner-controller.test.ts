/**
 * P0-36 — QR tarayıcı denetleyicisi.
 * Kök nedenleri yeniden üretir: bayat kapanımla istek fırtınası, senkron fırlatan
 * stop/clear ile temizlik istisnası, başlatma sürerken unmount'ta açık kalan kamera.
 */
import {
  QrScannerController,
  SCANNER_STATE,
  classifyCameraError,
  preflightCameraError,
  teardownScanner,
  type Html5QrcodeLike,
} from '@/lib/hooks/qr-scanner-controller';

/** html5-qrcode semantiğini taklit eder: stop() taramıyorsa SENKRON fırlatır, clear() tararken fırlatır. */
class FakeScanner implements Html5QrcodeLike {
  state: number = SCANNER_STATE.NOT_STARTED;
  onSuccess: ((text: string) => void) | null = null;
  startCalls = 0;
  stopCalls = 0;
  clearCalls = 0;
  pauseCalls = 0;
  resumeCalls = 0;
  cameraOpen = false;
  private startGate: Promise<void> | null = null;
  private releaseStart: (() => void) | null = null;
  startError: unknown = null;

  holdStart(): void {
    this.startGate = new Promise((r) => {
      this.releaseStart = r;
    });
  }
  release(): void {
    this.releaseStart?.();
  }

  async start(_camera: unknown, _config: unknown, onSuccess: (text: string) => void): Promise<null> {
    this.startCalls += 1;
    this.onSuccess = onSuccess;
    if (this.startGate) await this.startGate;
    if (this.startError) throw this.startError;
    this.cameraOpen = true;
    this.state = SCANNER_STATE.SCANNING;
    return null;
  }
  stop(): Promise<void> {
    if (this.state !== SCANNER_STATE.SCANNING && this.state !== SCANNER_STATE.PAUSED) {
      throw 'Cannot stop, scanner is not running or paused.';
    }
    this.stopCalls += 1;
    return Promise.resolve().then(() => {
      this.cameraOpen = false;
      this.state = SCANNER_STATE.NOT_STARTED;
    });
  }
  pause(): void {
    if (this.state !== SCANNER_STATE.SCANNING) throw 'Cannot pause, scanner is not scanning.';
    this.pauseCalls += 1;
    this.state = SCANNER_STATE.PAUSED;
  }
  resume(): void {
    if (this.state !== SCANNER_STATE.PAUSED) throw 'Cannot result, scanner is not paused.';
    this.resumeCalls += 1;
    this.state = SCANNER_STATE.SCANNING;
  }
  clear(): void {
    if (this.state === SCANNER_STATE.SCANNING) throw 'Cannot clear while scan is ongoing, close it first.';
    this.clearCalls += 1;
  }
  getState(): number {
    return this.state;
  }
  /** Kamera bir kare çözümledi. */
  emit(text: string): void {
    this.onSuccess?.(text);
  }
}

const flush = async (times = 5) => {
  for (let i = 0; i < times; i += 1) await Promise.resolve();
};

function setup(overrides: Partial<ConstructorParameters<typeof QrScannerController>[0]> = {}) {
  const fake = new FakeScanner();
  let clock = 1_000;
  let onDecode: jest.Mock = jest.fn(async (_text: string) => {});
  const controller = new QrScannerController({
    elementId: 'qr-reader',
    createScanner: async () => fake,
    onDecode: (text: string) => onDecode(text),
    now: () => clock,
    dedupeMs: 3000,
    ...overrides,
  });
  return {
    fake,
    controller,
    advance: (ms: number) => {
      clock += ms;
    },
    setOnDecode: (fn: jest.Mock) => {
      onDecode = fn;
    },
    get onDecode() {
      return onDecode;
    },
  };
}

describe('QrScannerController — tek uçuş kilidi (istek fırtınası)', () => {
  it('QR kadrajda kalıp her karede çözümlense bile işleyici bir kez çağrılır ve tarayıcı duraklar', async () => {
    const ctx = setup();
    let release!: () => void;
    ctx.setOnDecode(jest.fn(() => new Promise<void>((r) => (release = r))));
    await ctx.controller.start();
    expect(ctx.controller.getSnapshot().status).toBe('scanning');

    // fps=10 ile 3 saniye: 30 kare aynı kodu çözümler (eski kod 30 API isteği atıyordu).
    for (let i = 0; i < 30; i += 1) ctx.fake.emit('https://qratex.app/c/TOKEN123');
    await flush();

    expect(ctx.onDecode).toHaveBeenCalledTimes(1);
    expect(ctx.fake.pauseCalls).toBe(1);
    expect(ctx.controller.getSnapshot().status).toBe('paused');

    // Farklı bir kod bile işleyici sürerken kabul edilmez.
    ctx.fake.emit('https://qratex.app/c/OTHER');
    await flush();
    expect(ctx.onDecode).toHaveBeenCalledTimes(1);

    release();
    await flush(10);
    expect(ctx.controller.getSnapshot().status).toBe('scanning');
    expect(ctx.fake.resumeCalls).toBe(1);
  });

  it('işleyici bittikten sonra aynı kod dedupe süresince yok sayılır, süre dolunca tekrar işlenir', async () => {
    const ctx = setup();
    await ctx.controller.start();

    ctx.fake.emit('CODE-A');
    await flush(10);
    expect(ctx.onDecode).toHaveBeenCalledTimes(1);

    ctx.advance(1000);
    ctx.fake.emit('CODE-A');
    await flush(10);
    expect(ctx.onDecode).toHaveBeenCalledTimes(1);

    // Farklı kod hemen işlenir.
    ctx.fake.emit('CODE-B');
    await flush(10);
    expect(ctx.onDecode).toHaveBeenCalledTimes(2);

    ctx.advance(3500);
    ctx.fake.emit('CODE-A');
    await flush(10);
    expect(ctx.onDecode).toHaveBeenCalledTimes(3);
  });

  it('başlatmadan sonra değişen işleyicinin GÜNCEL sürümü çağrılır (bayat kapanım yok)', async () => {
    const ctx = setup();
    const first = jest.fn(async () => {});
    const latest = jest.fn(async () => {});
    ctx.controller.setDecodeHandler(first);
    await ctx.controller.start();
    ctx.controller.setDecodeHandler(latest); // React yeniden render etti: yeni state'li işleyici
    ctx.fake.emit('X1');
    await flush(10);
    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledWith('X1');
  });

  it('işleyici hata fırlatsa da kilit açılır ve tarama sürer', async () => {
    const ctx = setup();
    ctx.setOnDecode(jest.fn(async () => {
      throw new Error('ağ hatası');
    }));
    await ctx.controller.start();
    ctx.fake.emit('E1');
    await flush(10);
    expect(ctx.controller.getSnapshot().status).toBe('scanning');
    ctx.fake.emit('E2');
    await flush(10);
    expect(ctx.onDecode).toHaveBeenCalledTimes(2);
  });

  it('işleyici kamerayı kapatırsa tarama sürdürülmez', async () => {
    const ctx = setup();
    ctx.setOnDecode(jest.fn(async () => {
      await ctx.controller.stop();
    }));
    await ctx.controller.start();
    ctx.fake.emit('FOUND');
    await flush(20);
    expect(ctx.controller.getSnapshot().status).toBe('idle');
    expect(ctx.fake.resumeCalls).toBe(0);
    expect(ctx.fake.cameraOpen).toBe(false);
  });

  it('boş/whitespace çözümleme yok sayılır', async () => {
    const ctx = setup();
    await ctx.controller.start();
    ctx.fake.emit('   ');
    await flush();
    expect(ctx.onDecode).not.toHaveBeenCalled();
  });
});

describe('QrScannerController — idempotent teardown', () => {
  it('eşzamanlı stop çağrıları tek kapatma yapar ve istisna atmaz', async () => {
    const ctx = setup();
    await ctx.controller.start();
    const a = ctx.controller.stop();
    const b = ctx.controller.stop();
    expect(a).toBe(b);
    await expect(Promise.all([a, b])).resolves.toBeDefined();
    expect(ctx.fake.stopCalls).toBe(1);
    expect(ctx.fake.clearCalls).toBe(1);
    expect(ctx.fake.cameraOpen).toBe(false);
    expect(ctx.controller.getSnapshot().status).toBe('idle');

    // Zaten kapalıyken tekrar stop: html5-qrcode senkron fırlatırdı; burada sessiz.
    await expect(ctx.controller.stop()).resolves.toBeUndefined();
    expect(ctx.fake.stopCalls).toBe(1);
  });

  it('başlatma sürerken unmount (stop) olursa başlatma bitince kamera kapatılır', async () => {
    const ctx = setup();
    ctx.fake.holdStart(); // getUserMedia izin istemi açık
    const starting = ctx.controller.start();
    await flush();
    expect(ctx.controller.getSnapshot().status).toBe('starting');

    const stopping = ctx.controller.stop(); // bileşen unmount oldu
    ctx.fake.release(); // kullanıcı izin verdi, kamera açıldı
    await starting;
    await stopping;

    expect(ctx.fake.cameraOpen).toBe(false);
    expect(ctx.fake.stopCalls).toBe(1);
    expect(ctx.controller.getSnapshot().status).toBe('idle');
  });

  it('teardownScanner taramayan tarayıcıda stop çağırmaz, clear fırlatsa bile çözülür', async () => {
    const fake = new FakeScanner();
    await expect(teardownScanner(fake)).resolves.toBeUndefined();
    expect(fake.stopCalls).toBe(0);
    expect(fake.clearCalls).toBe(1);

    const broken: Html5QrcodeLike = {
      start: async () => null,
      stop: () => {
        throw 'senkron hata';
      },
      pause: () => {},
      resume: () => {},
      clear: () => {
        throw 'clear hatası';
      },
      getState: () => SCANNER_STATE.SCANNING,
    };
    await expect(teardownScanner(broken)).resolves.toBeUndefined();
  });

  it('start idempotent: çift tıklama tek kamera oturumu açar', async () => {
    const ctx = setup();
    const create = jest.fn(async () => ctx.fake);
    const controller = new QrScannerController({
      elementId: 'x',
      createScanner: create,
      onDecode: ctx.onDecode,
    });
    const p1 = controller.start();
    const p2 = controller.start();
    await Promise.all([p1, p2]);
    await controller.start();
    expect(create).toHaveBeenCalledTimes(1);
    expect(ctx.fake.startCalls).toBe(1);
  });

  it('kamera değiştirme: kapatır, yönü çevirir, yeniden açar', async () => {
    const ctx = setup();
    await ctx.controller.start();
    expect(ctx.controller.getSnapshot().facingMode).toBe('environment');
    await ctx.controller.switchCamera();
    expect(ctx.controller.getSnapshot().facingMode).toBe('user');
    expect(ctx.controller.getSnapshot().status).toBe('scanning');
    expect(ctx.fake.stopCalls).toBe(1);
    expect(ctx.fake.startCalls).toBe(2);
  });
});

describe('QrScannerController — hata yolu', () => {
  it('Permissions-Policy kamerayı engelliyorsa izin istemeden policy-blocked döner', async () => {
    const create = jest.fn();
    const controller = new QrScannerController({
      elementId: 'x',
      createScanner: create,
      onDecode: async () => {},
      getEnvironment: () => ({ isSecureContext: true, hasMediaDevices: true, policyAllowsCamera: false }),
    });
    await controller.start();
    expect(create).not.toHaveBeenCalled();
    expect(controller.getSnapshot()).toMatchObject({ status: 'error', error: { code: 'policy-blocked' } });
  });

  it('html5-qrcode düz metin izin hatası permission-denied olarak sınıflanır; kamera kapalı kalır', async () => {
    const ctx = setup({
      getEnvironment: () => ({ isSecureContext: true, hasMediaDevices: true, policyAllowsCamera: true }),
    });
    ctx.fake.startError = 'Error getting userMedia, error = NotAllowedError: Permission denied';
    await ctx.controller.start();
    expect(ctx.controller.getSnapshot().error?.code).toBe('permission-denied');
    expect(ctx.fake.cameraOpen).toBe(false);
    // Hata sonrası tekrar dene
    ctx.fake.startError = null;
    ctx.controller.resetError();
    await ctx.controller.start();
    expect(ctx.controller.getSnapshot().status).toBe('scanning');
  });

  it('kap bulunamazsa element-missing', async () => {
    const ctx = setup({ waitForElement: async () => false });
    await ctx.controller.start();
    expect(ctx.controller.getSnapshot().error?.code).toBe('element-missing');
    expect(ctx.fake.startCalls).toBe(0);
  });

  it('classifyCameraError farklı biçimleri ayırt eder', () => {
    expect(classifyCameraError({ name: 'NotFoundError', message: 'Requested device not found' }).code).toBe('not-found');
    expect(classifyCameraError({ name: 'NotReadableError', message: 'Could not start video source' }).code).toBe('in-use');
    expect(classifyCameraError('Camera streaming not supported by the browser.').code).toBe('unsupported');
    expect(classifyCameraError({ name: 'SecurityError', message: '' }).code).toBe('insecure-context');
    expect(classifyCameraError({ name: 'NotAllowedError' }, { policyAllowsCamera: false }).code).toBe('policy-blocked');
    expect(classifyCameraError(new Error('garip')).code).toBe('unknown');
  });

  it('preflightCameraError güvensiz bağlam ve eksik API’yi yakalar', () => {
    expect(preflightCameraError({ isSecureContext: false, hasMediaDevices: true, policyAllowsCamera: null })?.code).toBe(
      'insecure-context',
    );
    expect(preflightCameraError({ isSecureContext: true, hasMediaDevices: false, policyAllowsCamera: null })?.code).toBe(
      'unsupported',
    );
    expect(preflightCameraError({ isSecureContext: true, hasMediaDevices: true, policyAllowsCamera: null })).toBeNull();
  });
});

describe('QrScannerController — abonelik', () => {
  it('durum değişince dinleyiciler çağrılır, anlık görüntü yalnız değişince yenilenir', async () => {
    const ctx = setup();
    const listener = jest.fn();
    const unsubscribe = ctx.controller.subscribe(listener);
    const before = ctx.controller.getSnapshot();
    expect(ctx.controller.getSnapshot()).toBe(before);
    await ctx.controller.start();
    expect(listener).toHaveBeenCalled();
    expect(ctx.controller.getSnapshot()).not.toBe(before);
    unsubscribe();
    listener.mockClear();
    await ctx.controller.stop();
    expect(listener).not.toHaveBeenCalled();
  });
});
