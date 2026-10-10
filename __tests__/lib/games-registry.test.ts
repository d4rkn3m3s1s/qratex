/**
 * lib/games/registry — portföy kararı (§7.3) ile kayıt defterinin hizası, rota kararları,
 * sunucu kuralları ve istemci/sunucu ayrımı (etiketli içerik istemci paketine sızmaz).
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import {
  GAMES,
  RETIRED_GAMES,
  LEGACY_ALIASES,
  PORTFOLIO_CAP,
  getGameEntry,
  liveGames,
  resolveGameRoute,
} from '@/lib/games/registry';
import { SERVER_GAME_MODULES, getVerifierForGameType } from '@/lib/games/registry/server';
import { getGameDef, visibleMiniGames } from '@/lib/minigame-config';

const KEBAB = /^[a-z0-9]+(-[a-z0-9]+)*$/;

describe('portföy (§7.3)', () => {
  it('13 hedef oyun, benzersiz kebab-case kimlik ve sunucu anahtarı', () => {
    expect(GAMES).toHaveLength(13);
    const ids = GAMES.map((g) => g.id);
    const types = GAMES.map((g) => g.gameType);
    expect(new Set(ids).size).toBe(13);
    expect(new Set(types).size).toBe(13);
    for (const id of ids) expect(id).toMatch(KEBAB);
    expect(GAMES.map((g) => g.title)).toEqual([
      'Sahte Avcısı',
      'Zihin Hırsızı',
      'Çekirdek Savunması',
      'Kar Tanesi Yakala',
      'Yıldız Avı',
      'Veri Yılanı',
      'Yorum İstifi',
      'Spam Kırıcı',
      'Güven Birleştir',
      'Sinyal Bağla',
      'Günün Kelimesi',
      'Eşleştir-3',
      'Mekân Bilgi Yarışması',
    ]);
    expect(GAMES[0].role).toBe('flagship');
  });

  it('emekli 6 oyun portföyde yok; canlı oyun sayısı tavanı aşmaz', () => {
    expect(RETIRED_GAMES.map((g) => g.id).sort()).toEqual(
      ['combo-tap', 'data-miner', 'lucky-wheel', 'memory-match', 'network-defender', 'speed-order'].sort()
    );
    for (const r of RETIRED_GAMES) expect(getGameEntry(r.id)).toBeUndefined();
    expect(liveGames().length).toBeLessThanOrEqual(PORTFOLIO_CAP);
    expect(GAMES.filter((g) => g.status !== 'retired').length).toBeLessThanOrEqual(PORTFOLIO_CAP + 1);
  });

  it('birleşen eski kimlikler var olan hedefe gider; hedefin mergedFrom listesiyle tutarlı', () => {
    expect(Object.keys(LEGACY_ALIASES).sort()).toEqual(
      ['bot-hunter', 'guardian-of-trust', 'pacman', 'review-detective', 'spam-defense', 'troll-slayer', 'truth-vs-fake', 'word-spot'].sort()
    );
    for (const [legacy, alias] of Object.entries(LEGACY_ALIASES)) {
      const target = getGameEntry(alias.target)!;
      expect(target).toBeDefined();
      expect(target.mergedFrom).toContain(legacy);
    }
  });

  it('canlı girdide bileşen var; yapım aşamasındakinde yok', () => {
    for (const g of GAMES) {
      if (g.status === 'live') expect(g.component).not.toBeNull();
      if (g.status === 'building') expect(g.component).toBeNull();
      // Eski sözleşmeli bileşen pratik modunu bilmez — vaat edilmez.
      if (g.component?.contract === 'legacy') expect(g.modes.practice).toBe(false);
    }
  });
});

describe('sunucu kuralları ile hiza', () => {
  it('her oyunun sunucu kuralı var; yapım aşamasındakiler gizli + release=building', () => {
    for (const g of GAMES) {
      const def = getGameDef(g.gameType);
      expect(def).toBeDefined();
      if (g.status === 'building') {
        expect(def!.hidden).toBe(true);
        expect(def!.release).toBe('building');
      } else {
        expect(def!.release).toBeUndefined();
      }
    }
  });

  it('yapım aşamasındaki oyunlar turnuva rotasyonuna girmez (aday listesi kaymaz)', () => {
    const visible = new Set(visibleMiniGames().map((g) => g.gameType));
    for (const g of GAMES.filter((x) => x.status === 'building')) expect(visible.has(g.gameType)).toBe(false);
  });

  it('sunucu modül anahtarları kayıt defterinin gameType kümesiyle birebir', () => {
    expect(Object.keys(SERVER_GAME_MODULES).sort()).toEqual(GAMES.map((g) => g.gameType).sort());
    expect(getVerifierForGameType('yok-boyle')).toBeNull();
    expect(getVerifierForGameType('__proto__')).toBeNull();
  });
});

describe('rota kararı', () => {
  it('canlı → oyna; yapım → hub; bilinmeyen → hub', () => {
    expect(resolveGameRoute('mind-thief')).toMatchObject({ kind: 'play' });
    expect(resolveGameRoute('star-hunt')).toMatchObject({ kind: 'play' });
    expect(resolveGameRoute('fake-hunter')).toEqual({ kind: 'hub', reason: 'building' });
    expect(resolveGameRoute('yok-boyle')).toEqual({ kind: 'hub', reason: 'unknown' });
  });

  it('eski kimlik: hedef canlıysa kalıcı yönlendirme, değilse hub', () => {
    expect(resolveGameRoute('pacman')).toEqual({ kind: 'redirect', to: '/customer/games/star-hunt', permanent: true });
    expect(resolveGameRoute('guardian-of-trust')).toEqual({
      kind: 'redirect',
      to: '/customer/games/frost-catcher?mod=muhafiz',
      permanent: true,
    });
    // Sahte Avcısı henüz yapım aşamasında → eski oyunlar hub'a (kendi statik sayfaları dururken).
    expect(resolveGameRoute('truth-vs-fake')).toEqual({ kind: 'hub', reason: 'alias-pending' });
  });

  it('emekli: halef canlıysa ona, değilse hub', () => {
    expect(resolveGameRoute('combo-tap')).toEqual({ kind: 'redirect', to: '/customer/games/mind-thief', permanent: true });
    expect(resolveGameRoute('memory-match')).toEqual({ kind: 'hub', reason: 'retired' }); // Eşleştir-3 yapımda
    expect(resolveGameRoute('lucky-wheel')).toEqual({ kind: 'hub', reason: 'retired' });
  });
});

describe('istemci / sunucu ayrımı', () => {
  const dir = path.join(process.cwd(), 'lib', 'games', 'registry');
  it('istemci girdileri doğrulayıcı, içerik ya da .server modülü import etmez', () => {
    const clientFiles = readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.server.ts') && f !== 'server.ts');
    expect(clientFiles.length).toBeGreaterThanOrEqual(15);
    for (const f of clientFiles) {
      const src = readFileSync(path.join(dir, f), 'utf8');
      const runtimeImports = src
        .split('\n')
        .filter((l) => /^\s*import\s/.test(l) && !/^\s*import\s+type\s/.test(l));
      for (const line of runtimeImports) {
        expect(`${f}: ${line}`).not.toMatch(/games\/content|\.server'|registry\/server|games\/verify/);
      }
    }
  });

  it('içerik havuzu istemci kancalarından içe aktarılmaz', () => {
    const hooks = readFileSync(path.join(process.cwd(), 'lib', 'games', 'engine', 'hooks.ts'), 'utf8');
    expect(hooks).not.toMatch(/games\/content|registry\/server/);
  });
});
