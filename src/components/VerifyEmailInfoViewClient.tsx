import { Link } from '@payloadcms/ui'

export function VerifyEmailInfoViewClient() {
  return (
    <div
      style={{
        alignItems: 'center',
        display: 'flex',
        justifyContent: 'center',
        minHeight: '100dvh',
        padding: '1.5rem',
      }}
    >
      <div
        style={{
          background: 'white',
          borderRadius: 8,
          boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
          maxWidth: 480,
          padding: '2rem',
          width: '100%',
        }}
      >
        <h2
          style={{
            color: '#333',
            fontSize: '1.5rem',
            fontWeight: 600,
            marginBottom: '0.75rem',
            textAlign: 'center',
          }}
        >
          Check your email
        </h2>
        <p
          style={{
            color: '#555',
            fontSize: '0.9875rem',
            lineHeight: 1.6,
            marginBottom: '1.75rem',
            textAlign: 'center',
          }}
        >
          We’ve sent a magic sign-in link to your inbox. Open the email and click the link to
          continue. If you don’t see it, check your spam folder.
        </p>

        <p
          style={{
            color: '#666',
            fontSize: '0.9375rem',
            marginTop: '1.5rem',
            textAlign: 'center',
          }}
        >
          Ready to try again?
          <Link href="/admin/auth">Go back to sign-in</Link>.
        </p>
      </div>
    </div>
  )
}
