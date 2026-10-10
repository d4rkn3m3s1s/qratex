'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { ErrorState, type ErrorStateProps } from '@/components/states';

export type PanelErrorFallbackProps = { error: Error & { digest?: string }; reset: () => void };

export type PanelErrorBoundaryProps = {
  children?: ReactNode;
  /** Özel yedek görünüm; verilmezse `ErrorState` (yeniden dene ile). */
  fallback?: ReactNode | ((props: PanelErrorFallbackProps) => ReactNode);
  /** Raporlama (Sentry vb.). Verilmezse `console.error`. */
  onError?: (error: Error, info: ErrorInfo) => void;
  /** Bu değerlerden biri değişince sınır kendini sıfırlar (ör. `[pathname, id]`). */
  resetKeys?: readonly unknown[];
  /** Sıfırlandığında (yeniden dene / resetKeys) çağrılır — ör. `query.refetch`. */
  onReset?: () => void;
  /** `section` (varsayılan): kart içi; `page`: sayfanın tamamı. */
  variant?: ErrorStateProps['variant'];
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
};

type State = { error: (Error & { digest?: string }) | null };

function keysChanged(a: readonly unknown[] = [], b: readonly unknown[] = []): boolean {
  return a.length !== b.length || a.some((v, i) => !Object.is(v, b[i]));
}

/**
 * Panel hata sınırı — bir bölümün render hatası sayfanın tamamını
 * düşürmez; o bölümde `ErrorState` (role="alert", tekrar dene, hata kodu)
 * gösterilir. Route seviyesindeki `error.tsx`'in bölüm ölçeğindeki eşi.
 *
 *   <PanelErrorBoundary resetKeys={[dealerId]}>
 *     <RiskyWidget />
 *   </PanelErrorBoundary>
 */
export class PanelErrorBoundary extends Component<PanelErrorBoundaryProps, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (this.props.onError) this.props.onError(error, info);
    else if (typeof console !== 'undefined') console.error('[PanelErrorBoundary]', error, info.componentStack);
  }

  componentDidUpdate(prev: PanelErrorBoundaryProps) {
    if (this.state.error && keysChanged(prev.resetKeys, this.props.resetKeys)) this.reset();
  }

  reset = () => {
    this.props.onReset?.();
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children ?? null;
    const { fallback, variant = 'section', title, description, action, className } = this.props;
    if (typeof fallback === 'function') return fallback({ error, reset: this.reset });
    if (fallback !== undefined) return fallback;
    return (
      <ErrorState
        variant={variant}
        title={title}
        description={description}
        action={action}
        digest={error.digest}
        onRetry={this.reset}
        className={className}
      />
    );
  }
}
