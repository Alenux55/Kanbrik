import { SMTPServer } from 'smtp-server';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';

// Test-only, loopback-only SMTP sink. Never relays or writes mail/tokens to disk.
export async function startMailCapture({ smtpPort = 0, httpPort = 0, secret = randomBytes(32).toString('hex') } = {}) {
  const messages = [];
  const smtp = new SMTPServer({
    logger: false, disabledCommands: ['STARTTLS'], size: 128 * 1024,
    onAuth(auth, session, callback) { callback(null, { user: auth.username }); },
    onData(stream, session, callback) {
      let raw = '';
      stream.on('data', chunk => { raw += chunk.toString('utf8'); });
      stream.on('end', () => {
        const split = raw.indexOf('\r\n\r\n');
        const headers = raw.slice(0, split);
        const body = raw.slice(split + 4);
        const text = /Content-Transfer-Encoding: base64/i.test(headers) ? Buffer.from(body.replace(/\s/g, ''), 'base64').toString('utf8') : body;
        const from = headers.match(/^From:([^\r\n]*(?:\r\n[ \t][^\r\n]*)*)/im)?.[1].replace(/\r\n[ \t]+/g, ' ').trim() ?? '';
        messages.push({ from, envelopeFrom: session.envelope.mailFrom?.address, to: session.envelope.rcptTo.map(recipient => recipient.address), text });
        callback();
      });
    },
  });
  await new Promise((resolve, reject) => { smtp.once('error', reject); smtp.listen(smtpPort, '127.0.0.1', resolve); });
  const http = createServer((request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    if (url.pathname === '/health') { response.writeHead(200); response.end('ready'); return; }
    if (request.headers['x-test-mail-secret'] !== secret) { response.writeHead(403); response.end(); return; }
    response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    response.end(JSON.stringify(messages.filter(message => message.to.includes(url.searchParams.get('to')))));
  });
  await new Promise(resolve => http.listen(httpPort, '127.0.0.1', resolve));
  return { messages, port: smtp.server.address().port, close: async () => {
    await new Promise(resolve => http.close(resolve));
    await new Promise(resolve => smtp.close(resolve));
  } };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.env.TEST_MAIL_SECRET || process.env.KANBRIK_ENV !== 'test') throw new Error('Mail capture requires explicit test configuration');
  await startMailCapture({ smtpPort: 3125, httpPort: 3126, secret: process.env.TEST_MAIL_SECRET });
}
