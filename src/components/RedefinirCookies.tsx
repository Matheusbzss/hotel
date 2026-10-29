'use client';

export function RedefinirCookies({ rotulo, className = 'botao' }: { rotulo: string; className?: string }) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        try {
          localStorage.removeItem('vh_consentimento_cookies');
        } catch {}
        window.location.reload();
      }}
    >
      {rotulo}
    </button>
  );
}
