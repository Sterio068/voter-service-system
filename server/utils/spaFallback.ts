import fs from 'fs'

type ReplyLike = {
  type: (contentType: string) => ReplyLike
  send: (payload: Buffer) => unknown
}

export function sendSpaFallback(reply: ReplyLike, indexHtmlPath: string) {
  return reply
    .type('text/html; charset=utf-8')
    .send(fs.readFileSync(indexHtmlPath))
}
