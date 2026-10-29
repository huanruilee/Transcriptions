# Issue #9 Trace Report — 不動手修，只看 root cause

**日期**：2026-10-16  
**作者**：小法（純讀 trace，**未修改 source**）  
**基於**：origin/main `38b4b1e`

---

## Issue 描述

**[Bug][P2] 側欄快速搜尋未套用過濾結果**

建立：2026-08-17  
Target commit：`ac1f3f8`  
Labels：bug, needs-triage  
目前狀態：**open**（仍開著）

原始描述（節錄）：
> In `src/js/app.js`, `initSidebarFilter()` updates `sidebarFilterValue`, but its input handler renders `courseData.sessions` (full list) — typing query 不會套用 `getFilteredSessions()`.

修法建議（Issue 內含）：
```diff
- renderSidebar(courseData.sessions, currentSessionId, switchSession, courseData.unavailableSessions);
+ renderSidebar(getFilteredSessions(), currentSessionId, switchSession, courseData.unavailableSessions);
```

---

## Trace 結果

### 1. Issue 是否已修？**是**

Git history 顯示**已修**：

```
commit ac139c2469767baffec0a1414dbfeca79ece7a8a
Author: 小硯 <xiaoYan@openclaw.ai>
Date:   Tue Aug 18 06:18:47 2026 +0800

    Issue #9: Pass getFilteredSessions() to renderSidebar and add jsdom behavior test

    Root cause: initSidebarFilter() called renderSidebar(courseData.sessions, ...)
    on every input event, ignoring sidebarFilterValue. Manual searches silently
    fell back to the full list with no narrowing.

    Fix: Call renderSidebar(getFilteredSessions(), currentSessionId, switchSession,
    courseData.unavailableSessions) so the input actually filters.
```

這個 commit：
- ✅ 在 `origin/main`（已合入 main）
- ✅ Author = 小硯（不是 main branch 直接 push 應是 merge 進來）
- ✅ 修改了 `src/js/app.js`（line 1245）
- ✅ 新增了 `tests/unit/sidebarFilterBehavior.test.js`（13 個 test cases）

### 2. 現有程式碼是否符合修法？

讀 `src/js/app.js:1238-1248`：

```js
function initSidebarFilter() {
  const input = document.getElementById('sidebar-filter');
  if (!input) return;

  input.addEventListener('input', () => {
    sidebarFilterValue = input.value.trim().toLowerCase();
    if (courseData) {
      renderSidebar(getFilteredSessions(), currentSessionId, switchSession, courseData.unavailableSessions);
    }
  });
}
```

✅ line 1245 確實用 `getFilteredSessions()`，**修法已生效**。

### 3. Test 證據

`tests/unit/sidebarFilterBehavior.test.js`：
- 10,532 bytes
- ~13 個 test cases
- 描述：11 sub-cases（baseline 199, 02A, 歸敬頌, 99B, 99A, 甲二 造論宗旨, case-insensitive 02a, p.63, unavailable gap marker, active round trip）

跑測試結果（2026-10-16）：

```
npm test
✔ 577 tests
✔ 9 suites
✔ pass 573
✔ fail 0
✔ skipped 4
✔ duration_ms 2989.34
```

`sidebarFilterBehavior.test.js` 包含在 573 個 pass 內。**測試綠燈**。

### 4. 為什麼 Issue 仍 open？

**可能原因**（依證據推測）：

1. **缺 live browser 驗證**（AGY / HENRYLEE 沒手動跑）
2. **缺 PR 觸發 close 動作**——小硯 commit 了 fix，但 Issue close 動作可能在另一個 commit
3. **Issue owner 沒看到**——AGY 在 P2 review report 開 Issue，但沒指派 close 負責人
4. **人為遺忘**——常見的「修好了但忘了關 issue」反模式

**需要查**（Henry / AGY 才有權限）：
- Issue #9 的 close 權限（Henry 開的？AGY 開的？）
- 該 Issue 有無被指派 assignee

---

## 5. 結論與建議

### Issue #9 程式碼層面：**已修、無 bug**
### Issue #9 治理層面：**仍 open、未關**

### 給 Henry 的處置選項

| 選項 | 動作 | 風險 |
|---|---|---|
| A. 關 Issue + comment 引用 `ac139c2` | 由 Henry 執行 `gh issue close 9 --comment "Fixed in ac139c2"` | 無（commit 已在 main） |
| B. 派小硯補 close 動作 + 1 行 commit | 小硯有 issue close 權限 | 無 |
| C. 留 open 等 AGY 復驗 | 什麼都不做 | Issue 持續 noise |
| D. 派小法做 manual browser evidence（Issue 接受條件之一）| 小法**無 dev server 環境**，做不了 | 不可行 |

### 推薦

**A**——若 Henry 確認可 close → 我可代寫 `gh issue close 9 --comment-file` 命令給 Henry 確認後執行。

**B**——若小硯有權限 → 我可寫好 close 提案到 `.notes/issue-9-close-proposal.md` 給小硯。

**不推薦 C**——「測試綠燈但 Issue open」會造成 sprint 噪音。

**不可行 D**——小法無瀏覽器環境。

---

## 6. 小法這次 trace 的 scope

✅ 純讀檔（grep + read_file）  
✅ 跑測試（npm test）  
✅ 查 git history（git log）  
✅ 抓 Issue 描述（gh api）  
❌ 未修改 source  
❌ 未 push  
❌ 未 close issue  
❌ 未開新 commit  

---

## 7. 附錄：grep / git 指令

任何人可重跑驗證本 trace：

```bash
cd /home/henry/.gx10/xiaofa/workspace/Transcriptions

# 1. Issue 描述
gh api repos/huanruilee/Transcriptions/issues/9 | jq -r '.title, .state, .body'

# 2. Issue #9 修補 commit
git log --oneline -S "initSidebarFilter" | head
git show ac139c2 --stat
git show ac139c2

# 3. 現有程式碼是否已修
grep -n "initSidebarFilter" src/js/app.js
grep -n "getFilteredSessions" src/js/app.js
sed -n '1238,1248p' src/js/app.js

# 4. Test 檔
ls -la tests/unit/sidebarFilterBehavior.test.js
grep -c "test(\|it(" tests/unit/sidebarFilterBehavior.test.js

# 5. 跑測試
npm test 2>&1 | tail -10
```
