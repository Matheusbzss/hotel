'use client';

export function RedefinirCookies({ rotulo }: { rotulo: string }) {
  return (
    <button
      type="button"
      className="botao botao-tinta"
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
