# 隱私與分享邊界

## 預設

- localStorage 儲存在使用者自己的瀏覽器。
- JSON 備份由使用者自行保管。
- 原始文件不進網站、不進 build、不進 Git。
- AI 提案只包含必要的狀態、摘要、來源標籤、日期與可信度。

## 永遠不要提交

- `.env`、tokens、OAuth credentials、私鑰、service-role key；
- 護照、簽證、財力、銀行、保險或醫療文件；
- 完整 Email 本文與附件；
- 個人信箱清單、Gmail message ID／display URL、OAuth client 與 connector token；
- 精確住址、房號、訂位代碼、學號、電話、家人資料；
- 未經本人同意的照片。

## 分享模型

旅行分享是一個獨立資料邊界，只包含被選定的旅行、地圖、注意事項與小行李。可以設定唯讀／可編輯、任何拿到連結的人／指定手帳帳號、到期與撤銷。私人交換進度與個人衝突檢查不會進旅行分享。

## 上版前

執行 `npm run privacy:check`。它會檢查可提交檔案中的常見憑證、私人文件命名、個人絕對路徑、舊的 Sites project ID 與示範正式網址。工具只是最後一道防線，仍需人工預覽 Git 變更。
