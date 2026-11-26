# 客語主權 AI 語料徵集網站

發起單位：國立聯合大學客家研究學院 張陳基特聘教授 研究團隊。

可直接放入 GitHub、匯入 Vercel 的繁體中文響應式網站。採原生 HTML/CSS/JavaScript，無 npm 套件依賴；Supabase 提供 Email OTP、Postgres 與私人檔案儲存。GitHub/Vercel 只放網站程式，投稿原始檔不進 Git。

## 已實作

- 原創山巒／客庄 CSS 插畫、響應式首頁、作者權益、FAQ、可列印邀請說帖。
- Email 驗證碼登入；客語文字、華語客家文化書寫、客語語音，單次一檔最大 50 MB。
- 權利確認、完整授權／個資告知、輸入姓名電子簽署。
- 私人儲存、逐筆存取控制、伺服器驗證、不可由投稿者修改的簽署快照、收據與撤回流程。
- 依正式條款及環境設定雙重控制是否開放徵集。預設僅展示，不接收資料。

## 本機

Node.js 22 或以上；不需安裝 npm 套件。

```sh
node scripts.mjs build
node --test tests/*.test.mjs
node scripts.mjs serve
```

開啟 http://127.0.0.1:3000 。開發修改後重新執行 build 並重新整理。環境變數請由執行環境提供；`.env.example` 僅為設定範例，本工具不會自動讀取 `.env`。

## GitHub 與 Vercel

1. 在 GitHub 建立專案；將本資料夾的檔案提交。不要提交任何投稿檔案、service_role、secret key 或 `.env`。
2. Vercel → Add New Project → Import Git Repository。若把本資料夾放在其他 repo 內，Root Directory 選 `hakka-corpus`；若本資料夾就是 repo 根目錄則不用設定。
3. Framework 選 Other；Build Command 為 `node scripts.mjs build`；Output Directory 為 `dist`；Install Command 可留空。本專案已有 `vercel.json`。
4. 初次部署不填環境變數，即為可公開閱讀的預覽站，不收件。
5. 完成下方 Supabase 初始化、校方確認與實機驗收後，設定 `SUPABASE_URL`、`SUPABASE_ANON_KEY`（僅 public anon／publishable key）、`COLLECTION_ENABLED=true` 並重新部署。禁止使用 service_role 或 secret key。

## Supabase 初始化

1. 建立專案，確認資料中心所在地並記錄受託者、備份位置及處理地區。
2. SQL Editor 執行 `supabase/schema.sql`，限全新專案執行一次。
3. 確認 `public/terms.json` 的正式被授權單位、聯絡窗口、處理地區、期間、用途及個資告知；移除草案文字後設定 `approved: true`，給予新的 `version`。不得以本版預設文字直接收件。
4. `node supabase/seed.mjs`，將生成的 `supabase/license-seed.sql` 執行於 SQL Editor。確認內容後執行 `update public.license_versions set active=true where version='你的正式版本';`。更換版本須先將舊版 active 設 false；舊投稿保留原條款快照。
5. Authentication → Email Templates → Magic Link，改為驗證碼內容（含 `{{ .Token }}`），不是只放登入連結。啟用 Email provider 與 signups；設定正式 SMTP、寄信速率限制、驗證碼到期與錯誤次數限制。Site URL 設正式 HTTPS 網域。
6. Storage 的 `corpus` 必須為 private，bucket 限 50 MB，僅接受 `application/octet-stream`（前端統一採此型別）。不要加 public 存取 policy 或 overwrite policy。副檔名不是安全檢測，所有檔案先隔離，管理者掃毒及檢查格式後才能採用。
7. 公開前依 `docs/驗收與維運.md` 實測兩個帳號與匿名存取。現有程式沒有研究團隊管理後台；由 Supabase Dashboard 的授權管理者進行審核。

## 管理與授權邊界

- 使用者只可讀自己的投稿，無 insert/update/delete 表格權限；簽署透過 `submit_corpus` RPC 原子寫入資料與事件。Email 由 auth.users 取得、時間由資料庫產生、條款由伺服器取得。
- 姓名輸入 + Email OTP 是電子簽署證據流程，**不是自然人憑證式數位簽章**，也不證明投稿者實際擁有著作權。代表權須人工查核。
- SHA-256 為瀏覽器計算的摘要，欄位明確標為 `client_sha256`；正式審核需下載檔案重新計算及比對。收據 JSON 不是防竄改的數位簽章文件；權威紀錄在資料庫，需備份及管理存取。
- 訪客不能讀任何私人檔案，投稿者可以讀自己的原始檔。研究團隊只透過受限管理帳號操作。Supabase 專案管理權仍可改資料，需多人分權與外部稽核備份。
- 本專案不包含模型訓練、去識別器、原文相似度防護或聲音模型。說帖使用「應評估」而不是宣稱技術已保證零風險。
- 撤回申請立即讓資料退出 `training_candidates`；刪除檔案、資料集及備份是維運責任，詳見維運文件。訓練管線不可用下載過的舊清單直接重跑。
- 五年期、無償、非商業用途為初稿的產品設定，需由校方確認。本網站沒有引用其他 AI 授權條款的名稱來冒充已取得授權。

## 文件

- `public/appeal.html`：完整說帖，瀏覽器列印可存 PDF。
- `public/terms.json`：完整授權暨個資告知草案。
- `docs/驗收與維運.md`：上線測試、審核與撤回作業。
- `docs/資料來源.md`：法律及技術查核來源與限制。

## 驗證狀態

已通過建置、JavaScript 語法、3 項檔案檢查／摘要單元測試，以及 PGlite PostgreSQL/WASM 的資料庫整合冒煙測試（簽名／條款／同意驗證、重試冪等、跨帳號 RLS 隔離、撤回排除）。測試模擬 Supabase auth/storage schema；不等同正式 Supabase 服務驗收。桌面與 390px 手機視窗已實際瀏覽。

要重跑可選資料庫測試，另外安裝 `@electric-sql/pglite` 0.6.0，將環境變數 `PGLITE_MODULE` 指向其 `dist/index.js` 後執行 `node tests/database.integration.mjs`。它不是網站執行依賴。

未連接實際 Supabase、SMTP、GitHub 遠端或 Vercel 帳號，尚未完成正式寄信、Storage HTTP 上傳或雲端部署測試。
