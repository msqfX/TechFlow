import { chromium } from '@playwright/test'
const browser = await chromium.launch()
const page = await browser.newPage()
const errs = []
page.on('pageerror', e => errs.push(String(e).slice(0, 150)))
const slugs = ["ip-address","subnet-cidr","tcp-handshake","tcp-teardown","switch-working","arp-protocol","tcp-reliable","tls-handshake","tls-cert-verification","udp-protocol","dns-resolution","cdn-working","http-request-flow","cpu-executes-program","process-thread","jvm-memory-model","tomcat-internals","bubble-sort","quick-sort","stack-queue","linked-list","array","hash-table","merge-sort","bst","bfs-dfs","btree-index","mysql-architecture","raft-consensus","service-discovery","docker-container","docker-image","nginx-working","message-queue"]
for (const slug of slugs) {
  await page.goto(`http://localhost:4173/tutorials/${slug}`)
  await page.waitForTimeout(1500)
  const st = await page.evaluate(() => ({
    host: !!document.querySelector('.tf-scene-host'),
    hasErr: (document.body.textContent || '').includes('场景加载失败'),
    errText: (document.querySelector('.scene-error')?.textContent || '').slice(0, 200),
  }))
  if (!st.host || st.hasErr) {
    console.log(`FAIL ${slug}: host=${st.host} err=${st.hasErr} :: ${st.errText}`)
  }
}
console.log('pageerrors:', errs.length ? errs.join(' | ') : 'none')
await browser.close()
