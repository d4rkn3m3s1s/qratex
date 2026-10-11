'use client';

import { useEffect, useId, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChoiceChips } from '@/components/ds/a11y';
import { InlineError } from '@/components/states';
import { createUser, errorText } from './api';
import { FormField, fieldError } from './parts';

type Mode = 'invite' | 'password';
type Role = 'CUSTOMER' | 'DEALER';

/**
 * Kullanıcı oluşturma — varsayılan DAVET: şifre yönetici tarafından belirlenmez, tek kullanımlık
 * şifre belirleme bağlantısı e-postaya gider. Yönetici hesabı buradan açılamaz (dört göz ister).
 */
export function CreateUserDialog({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (o: boolean) => void; onCreated: (id: string) => void }) {
  const id = useId();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('CUSTOMER');
  const [businessName, setBusinessName] = useState('');
  const [mode, setMode] = useState<Mode>('invite');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (open) {
      setName('');
      setEmail('');
      setRole('CUSTOMER');
      setBusinessName('');
      setMode('invite');
      setPassword('');
      setError(null);
    }
  }, [open]);

  const err = (p: string) => fieldError(error, p);

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <form
          className="space-y-4"
          noValidate
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            setBusy(true);
            setError(null);
            try {
              const r = await createUser({
                name,
                email,
                role,
                businessName: role === 'DEALER' ? businessName : undefined,
                mode,
                password: mode === 'password' ? password : undefined,
              });
              toast.success(
                r.mode === 'invite'
                  ? r.mailSent
                    ? 'Kullanıcı oluşturuldu, davet e-postası gönderildi.'
                    : 'Kullanıcı oluşturuldu ama davet e-postası gönderilemedi. Erişim sekmesinden bağlantıyı yeniden gönderin.'
                  : 'Kullanıcı oluşturuldu. E-posta doğrulaması bekliyor.'
              );
              onOpenChange(false);
              onCreated(r.id);
            } catch (e2) {
              setError(e2);
            } finally {
              setBusy(false);
            }
          }}
        >
          <DialogHeader>
            <DialogTitle>Kullanıcı ekle</DialogTitle>
            <DialogDescription>Yönetici hesabı buradan açılmaz: kullanıcıyı oluşturup Erişim sekmesinden yükseltme talebi verin.</DialogDescription>
          </DialogHeader>

          <FormField htmlFor={`${id}-name`} label="Ad soyad" error={err('name')}>
            <Input id={`${id}-name`} value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" required aria-invalid={!!err('name')} />
          </FormField>
          <FormField htmlFor={`${id}-email`} label="E-posta" error={err('email')}>
            <Input id={`${id}-email`} type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" required aria-invalid={!!err('email')} />
          </FormField>
          <FormField htmlFor={`${id}-role`} label="Rol" error={err('role')} hint="Personel hesapları bayi panelindeki davetle açılır.">
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger id={`${id}-role`} className="min-h-11">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CUSTOMER">Müşteri</SelectItem>
                <SelectItem value="DEALER">Bayi</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
          {role === 'DEALER' ? (
            <FormField htmlFor={`${id}-biz`} label="İşletme adı" error={err('businessName')}>
              <Input id={`${id}-biz`} value={businessName} onChange={(e) => setBusinessName(e.target.value)} required aria-invalid={!!err('businessName')} />
            </FormField>
          ) : null}

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-fg">Giriş yöntemi</legend>
            <ChoiceChips
              aria-label="Giriş yöntemi"
              value={mode}
              onChange={(v) => setMode((v as Mode) || 'invite')}
              options={[
                { value: 'invite', label: 'Davet bağlantısı (önerilen)' },
                { value: 'password', label: 'Şifreyi ben belirleyeceğim' },
              ]}
            />
            <p className="text-xs text-fg-muted">
              {mode === 'invite'
                ? 'Kullanıcı 72 saat geçerli tek kullanımlık bağlantıyla kendi şifresini belirler. Şifre size görünmez.'
                : 'Şifreyi kullanıcıya güvenli bir kanaldan iletmeniz gerekir; e-posta doğrulanana kadar giriş yapılamaz.'}
            </p>
          </fieldset>
          {mode === 'password' ? (
            <FormField htmlFor={`${id}-pw`} label="Geçici şifre" error={err('password')} hint="En az 10 karakter.">
              <Input id={`${id}-pw`} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" aria-invalid={!!err('password')} />
            </FormField>
          ) : null}

          {error && !['name', 'email', 'role', 'businessName', 'password'].some((p) => err(p)) ? <InlineError>{errorText(error)}</InlineError> : null}

          <DialogFooter className="gap-2">
            <Button type="button" variant="outline" className="min-h-11" onClick={() => onOpenChange(false)} disabled={busy}>
              Vazgeç
            </Button>
            <Button type="submit" className="min-h-11" disabled={busy} aria-busy={busy}>
              {busy ? 'Oluşturuluyor…' : mode === 'invite' ? 'Oluştur ve davet gönder' : 'Oluştur'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
