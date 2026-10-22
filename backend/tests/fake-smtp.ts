import net from 'net';

/**
 * Minimal SMTP server so email code runs end to end through nodemailer without a
 * real mail account. Accepts any login and records each message.
 */
export interface CapturedMail {
  from: string;
  to: string[];
  data: string;
}

export async function startFakeSmtp() {
  const messages: CapturedMail[] = [];
  const server = net.createServer((socket) => {
    let buffer = '';
    let inData = false;
    let authStep: 'none' | 'plain' | 'login-user' | 'login-pass' = 'none';
    let current: CapturedMail = { from: '', to: [], data: '' };
    const reply = (line: string) => socket.write(`${line}\r\n`);
    reply('220 fake-smtp ESMTP ready');

    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      let idx;
      while ((idx = buffer.indexOf('\r\n')) >= 0) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        if (inData) {
          if (line === '.') {
            inData = false;
            messages.push(current);
            current = { from: '', to: [], data: '' };
            reply('250 queued');
          } else {
            current.data += `${line.startsWith('..') ? line.slice(1) : line}\n`;
          }
          continue;
        }
        if (authStep === 'plain' || authStep === 'login-pass') {
          authStep = 'none';
          reply('235 authenticated');
          continue;
        }
        if (authStep === 'login-user') {
          authStep = 'login-pass';
          reply('334 UGFzc3dvcmQ6');
          continue;
        }
        const cmd = line.slice(0, 4).toUpperCase();
        if (cmd === 'EHLO') {
          socket.write('250-fake-smtp\r\n250-AUTH PLAIN LOGIN\r\n250 OK\r\n');
        } else if (cmd === 'HELO') reply('250 fake-smtp');
        else if (cmd === 'AUTH') {
          const [, mech, initial] = line.split(' ');
          if (mech?.toUpperCase() === 'PLAIN') {
            if (initial) reply('235 authenticated');
            else {
              authStep = 'plain';
              reply('334 ');
            }
          } else {
            authStep = 'login-user';
            reply('334 VXNlcm5hbWU6');
          }
        } else if (cmd === 'MAIL') {
          current.from = line.replace(/^MAIL FROM:\s*/i, '');
          reply('250 OK');
        } else if (cmd === 'RCPT') {
          current.to.push(line.replace(/^RCPT TO:\s*/i, '').replace(/[<>]/g, ''));
          reply('250 OK');
        } else if (cmd === 'DATA') {
          inData = true;
          reply('354 end with .');
        } else if (cmd === 'QUIT') {
          reply('221 bye');
          socket.end();
        } else reply('250 OK'); // RSET, NOOP, ...
      }
    });
    socket.on('error', () => undefined);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as net.AddressInfo).port;
  return { port, messages, close: () => new Promise<void>((resolve) => server.close(() => resolve())) };
}
