/**
 * Shell 占位 UI。颜色一律走 CSS 变量（--ark-*），不写死色值。
 */
export default function App(): JSX.Element {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--ark-bg)',
        color: 'var(--ark-text)',
        fontFamily: 'system-ui, -apple-system, "Segoe UI", sans-serif',
      }}
    >
      <span
        style={{
          fontSize: 'var(--ark-font-display-size)',
          fontWeight: 'var(--ark-font-display-weight)',
          letterSpacing: '0.12em',
        }}
      >
        ARK
      </span>
    </div>
  );
}
