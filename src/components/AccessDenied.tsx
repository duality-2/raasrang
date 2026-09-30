export default function AccessDenied() {
  return (
    <div className="access-denied">
      <div className="access-denied-icon">🔒</div>
      <h2>Access Denied</h2>
      <p>
        You are signed in but you are not an authorised organiser.
        Contact the event admin to get access.
      </p>
      <form action="/api/auth/signout" method="post">
        <a href="/login" className="btn btn-secondary">
          Back to Sign In
        </a>
      </form>
    </div>
  );
}
