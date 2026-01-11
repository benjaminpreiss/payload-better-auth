import nodemailer from 'nodemailer'

// TODO: externalize / add variables to mail delivery
// TODO: add localization to emails.

const transporter = nodemailer.createTransport({
  host: '127.0.0.1',
  port: 1025,
  secure: false,
})

export async function sendEmail(opts: { html?: string; subject: string; to: string }) {
  await transporter.sendMail({
    from: '"Dev Auth" <no-reply@localhost.test>',
    ...opts,
  })
}
