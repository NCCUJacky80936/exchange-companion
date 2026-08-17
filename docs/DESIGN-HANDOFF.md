# Exchange Companion｜視覺與互動交接

> 版本基準：2026-08-17 working tree
>
> 參考圖：本次任務附件 `image-1.jpg`

## 0. Source of truth

後續修改依序以這些來源為準：

1. 現行 React 元件的功能、資料與導覽結構。
2. `app/globals.css` 最後有效的 cascade。
3. 本文件的視覺、插圖與互動規則。
4. `design-qa.md` 的三尺寸驗證紀錄。

除非另有明確需求，不得移動功能位置、刪除資訊、改寫資料模型、擴大分享權限，或改變 AI proposal 的 pending-only／可逆機制。

## 1. 視覺方向

- 以 Miyama 參考圖的暖白底、近黑字與黃／粉／薄荷／天藍色塊為基礎。
- 顏色比舊版更有存在感，但文字仍是視覺主角；不要用低對比灰字與過淡插圖讓畫面失去重心。
- 卡片與格線維持既有位置。強結構使用實線，同一張紙內的補充、編輯或細節層級使用虛線。
- 主要色塊按功能分配：藍色是路線與目前位置；黃色是月曆與主要注意；粉色是通知、警示與 focus；薄荷色是安全與支援狀態。
- 背景可有低透明度的柔和色場，但不能影響閱讀、按鈕辨識或卡片邊界。

## 2. 現行 token

| Token | 值 | 用途 |
|---|---|---|
| `--cream` | `#f7f3ef` | 全站暖白畫布 |
| `--paper` | `#fffdfa` | 紙卡、輸入框、彈窗 |
| `--ink` | `#202220` | 標題、內文、主要結構線 |
| `--muted` | `#5f655f` | 日期與次要說明 |
| `--yellow` | `#ffe281` | 月曆、主要注意、選取 |
| `--pink` | `#ffb4c2` | 通知、focus、警示 |
| `--sage` | `#aee1cf` | 安全、完成、支援狀態 |
| `--blue` | `#9fcefb` | 路線、目前導覽、交換狀態 |

文字使用現有字體與階級，不因換色重新排版。主標題維持深色粗體；內文基準 15px／1.55；次要文字不得淡到與插圖失衡。

## 3. 無框線插圖

所有主要插圖使用透明 PNG、簡單填色色塊與少量物件內部細節：

| 資產 | 角色 |
|---|---|
| `public/images/exchange-hero-clean.png` | welcome、onboarding、首頁旅行主圖 |
| `public/images/doodle-icons-v2/home-notebook.png` | 首頁、住宿 |
| `public/images/doodle-icons-v2/journey-route.png` | 旅程、地圖 |
| `public/images/doodle-icons-v2/travel-suitcase.png` | 旅行、行李 |
| `public/images/doodle-icons-v2/ai-spark.png` | AI、一般任務 |
| `public/images/doodle-icons-v2/resources-book.png` | 資源、提醒 |
| `public/images/doodle-icons-v2/settings-backup.png` | 設定與備份 |

規則：

- 不替插圖加卡片框、圓形 icon slot、外框線或裝飾底板。
- 保留透明背景與原比例，使用 `object-fit: contain`；不可拉伸或裁掉主體。
- 導覽約 34–45px、功能卡約 58–72px、空狀態約 150–180px。
- `exchange-hero-watercolor.png` 是未採用備選，不要在現行頁面混用。

## 4. Shell 與 responsive

- 桌面 sidebar 維持 244px，topbar 與 `.page-stack` 位置不變。
- 1440×900：首頁月曆與交換佈告欄在同一列，視覺高度需接近。
- 768×1024 與 390×844：佈告欄與月曆依既有 responsive 順序堆疊；document 不得產生水平 overflow。
- 手機側欄改由頂部導覽按鈕開啟；旅行日期 tabs 自行承擔水平捲動。
- Modal 使用動態 viewport，可捲動且保留清楚的關閉與主要操作。

## 5. 首頁

首頁結構：

1. `home-status-strip`：問候、路線、進度、倒數與旅行插圖。
2. `home-daily-grid`：互動月曆與交換佈告欄。
3. `home-core-grid`：交換旅程與預算。
4. AI 使用指南入口。

月曆規格：

- 取代舊四週行程軸，維持同一資訊區的位置。
- 提供上個月／今天／下個月。
- 有行程的日期使用來源色點；最多顯示四點，多出的以數字表示。
- 桌面 hover、手機 tap 顯示當日行程；外部點擊或 Escape 關閉。
- 彈出內容可跳到 task、study event、travel trip 或 journey milestone 的正確目標。

通知與里程碑：

- 首頁下一個里程碑必須帶 task id，不可只開旅程首頁。
- 旅行撞期通知帶 trip id，展開指定旅行並定位到衝突框。
- 到達目標後使用 `attention-arrive` 與 `attention-ring`；動畫結束後不得留下永久粗框。

## 6. 交換旅程

- `準備進度` 與 `出發行李` 的位置不變，按下時有 2px 貼手位移。
- phase 與任務結構、來源、個人紀錄、編輯與刪除功能全部保留。
- 同一 phase 內先顯示未開始／進行中／等待中，再顯示已完成／不適用；順序必須穩定。
- 展開個人紀錄後，任務移到 topbar 下方的適當位置。

## 7. 旅行規劃

- 進入頁面時所有旅行預設折疊；建立或編輯後也不自動展開。
- 未完成／進行中旅行在上，已結束旅行在下。
- 每趟旅行仍是一張 full-width accordion ticket；資訊與功能位置不變。
- 展開或折疊後，該旅行捲動到 topbar 下方；深連結優先定位衝突框。
- 展開內容保留摘要、住宿、參考資料、每日行程、地圖、注意事項、旅行行李、分享與匯出。
- 內容 tabs 與每日日期 tabs 有按下位移；展開 panel 使用 spring／ease-out 動畫並尊重 `prefers-reduced-motion`。

## 8. 共同編輯提示

- 「你是受邀的編輯者嗎？」完整輸入框在 30 秒未互動後收成小字按鈕。
- focus、pointer 或輸入時重設 30 秒計時。
- 小字按鈕可重新展開完整表單，不得移除 passwordless editor flow。

## 9. 動畫原則

- 互動節奏參考 transitions.dev：短、清楚、可逆，使用 springy arrival 和 pressed feedback。
- Gooey 的「連續流動與貼手」概念用在 tabs／accordion 的位移與 easing；現行版本不引入會造成 React renderer 衝突的額外 runtime。
- 不使用長時間漂浮、視差或干擾閱讀的背景動畫。
- 所有新增動畫必須提供 reduced-motion 退化。

## 10. 不可回歸功能

- 桌面／手機導覽可開啟首頁、旅程、旅行、AI、資源與設定。
- 任務、phase、個人紀錄、行李、預算與備份可操作。
- 旅行可新增、編輯、刪除、折疊、分享與匯出；住宿、參考資料、活動、提醒與短途行李可編輯。
- 撞期檢查與首頁通知可精準跳轉。
- 資源搜尋、分類、手動新增、AI URL、編輯與刪除保留。
- AI proposal inbox 保持 pending-only、可忽略、可套用、可撤銷。
- 登入、註冊、onboarding、Supabase mapping、privacy 與分享白名單不因設計改版改變。

## 11. 驗收

- [x] 參考圖與實作放在同一視覺比較 input。
- [x] 無框線透明插圖已套用到所有主要 illustration role。
- [x] 1440×900、768×1024、390×844 無 document overflow。
- [x] 月曆、折疊／展開、完成項目下移與精準跳轉已在 rendered app 驗證。
- [x] `npm run check`：90 tests passed。
- [x] production build 已確認 Supabase public config 進入前端 bundle。

詳細畫面與比較紀錄見 `design-qa.md`。
