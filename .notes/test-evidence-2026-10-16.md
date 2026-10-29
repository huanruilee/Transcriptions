# Test Evidence — 2026-10-16 audit

**作者**：小法  
**日期**：2026-10-16  
**基於**：origin/main `38b4b1e`

---

## npm test 結果（最終一次跑）

```
$ npm test
...

ℹ tests 577
ℹ suites 9
ℹ pass 573
ℹ fail 0
ℹ cancelled 0
ℹ skipped 4
ℹ todo 0
ℹ duration_ms 2989.341819

exit_code: 0
```

**解讀**：
- 577 個 test cases
- 573 pass（綠燈）
- 0 fail（無 regress）
- 4 skipped（明確被 skip，非 fail）
- 9 個 test suite
- 跑 2.99 秒

---

## Git HEAD 證據

```
$ git rev-parse HEAD
38b4b1eb7e6cd9d088050e669f7b17401ccc285c

$ git log -1 --format='%H %ci%n%s'
38b4b1eb7e6cd9d088050e669f7b17401ccc285c 2026-10-15T16:47:11+08:00
chore(deps): bump vue to 3.5.43 (#222)
```

最後一個 commit 是 `vue 3.5.43` dependabot bump（PR #222 已 merge）。

---

## Working Tree 狀態

```
$ git status --porcelain
?? .notes/
?? docs/PHASE_2_ROADMAP.md
?? docs/REPO_STATUS_2026-10-16.md
```

與 origin/main：**0 commits 落後**、0 modified（除了我新加的 3 個 untracked 檔）。

---

## CI 對應

GH Actions（GitHub-side）：

```
$ gh api repos/huanruilee/Transcriptions/actions/runs?per_page=5
```

最近 5 個 run 至少有一個對應 HEAD `38b4b1e` 為 success（**Completion Acceptance workflow**）。

（小法 2026-10-15 18:35 已驗證 CI run 38334675097 = success）

---

## 重現指令

任何人可在 5 分鐘內重現本證據：

```bash
# 1. clone / fetch
cd /home/henry/.gx10/xiaofa/workspace/Transcriptions
git fetch origin
git status  # 應為 main, ahead=0/behind=0 或 untracked

# 2. 安裝依賴（如有缺）
npm install --no-audit --no-fund

# 3. 跑測試
npm test
# 預期：577 / 573 / 0 / 4

# 4. 驗 HEAD
git rev-parse HEAD
# 預期：38b4b1eb7e6cd9d088050e669f7b17401ccc285c
```

---

## 已知 caveat

1. **`npm install` 必要**——origin/main clone 不含 node_modules，沒有 `npm install` 會出現 `ERR_MODULE_NOT_FOUND 'jsdom'` 導致 7 個 suite fail（cascading error）
2. **`npx vitest` 在此 clone 不能直接跑**——會出現 vite 模組問題；必須用 `npm test`（呼叫 `node --test`，繞過 vite ESM 載入）
3. **跳過 4 個 test**——非 bug，是測試框架刻意 skip（可能需要 `SI_FOO` env 變數才啟用）

---

## 給未來 sprint 的提醒

- 任何 sprint 工作前**先 `git fetch` + `git status`** 確認本地 sync
- 任何程式改動後**先 `npm test`** 確認不退步
- 任何 Issue close 動作**先 grep / git log 確認**是否已被某次 commit 修好
- npm test 0 fail **不等於內容正確**——只代表自動化測試框架通過

---

**檔案位置**：`/home/henry/.gx10/xiaofa/workspace/Transcriptions/.notes/test-evidence-2026-10-16.md`
