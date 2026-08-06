import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const referencePath = path.resolve(process.cwd(), 'docs/reference/docucore-prototype.html')

createServer(async (request, response) => {
  if (request.url !== '/docucore-prototype.html') {
    response.writeHead(404).end()
    return
  }

  try {
    const html = await readFile(referencePath)
    response.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    })
    response.end(html)
  } catch (error) {
    response.writeHead(500).end(error instanceof Error ? error.message : 'Unable to read reference HTML.')
  }
}).listen(4173, '127.0.0.1', () => {
  console.log('Reference HTML server listening on port 4173')
})
