# Contributing

請先建立 issue 說明要支援的國家、學校流程、無障礙或通用功能。Country-specific 規則不要直接寫死在 UI；應透過 profile、可審核資料或獨立 adapter 提供，並附官方來源與查核日期。

提交前執行：

```bash
npm install
npm run security:check
npm run audit:production
npm run check
```

若修改畫面，附上桌機、平板與手機驗證結果；若修改 Auth、RLS、RPC、Edge Function 或分享流程，另附未授權、跨帳號 IDOR、錯誤 Origin、超大 body 與重複 request 的驗證結果。不要在 issue、測試資料、圖片或 commit 內放真實證件、住址、Email、訂位代碼、tokens 或正式雲端 project binding。漏洞請依 [Security Policy](SECURITY.md) 私下回報，不要開公開 issue。
