// Slim site-wide footer rendered below every page.
export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="footer">
      <span>(c) {year} E-Waste Platform</span>
      <span style={{ display: 'inline-flex', gap: 16 }}>
        <a href="#about">About</a>
        <a href="#privacy">Privacy</a>
        <a href="#help">Help</a>
      </span>
    </footer>
  );
}
