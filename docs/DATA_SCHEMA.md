# DATA_SCHEMA.md — 課程數據 JSON 格式標準規格

本文件定義 `Transcriptions` 平台所使用之三大數據 Schema (`course.json`, `toc.json`, `session_XX.json`)，實現課程數據與前端渲染層解耦。

---

## 1. 課程詮釋資料 Schema (`course.json`)

存放於 `courses/[課程名稱]/course.json`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "CourseMeta",
  "type": "object",
  "properties": {
    "courseId": { "type": "string", "example": "ru-zhong-lun" },
    "title": { "type": "string", "example": "入中論善顯密意疏" },
    "lecturer": { "type": "string", "example": "見無法師" },
    "description": { "type": "string" },
    "coverImage": { "type": "string" },
    "sessions": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "sessionId": { "type": "string", "example": "02A" },
          "sessionNum": { "type": "integer", "example": 2 },
          "subSession": { "type": "string", "example": "A" },
          "date": { "type": "string", "format": "date", "example": "2016-05-28" },
          "pageRange": { "type": "string", "example": "p.63-64" },
          "audioUrl": { "type": "string" },
          "jsonUrl": { "type": "string" }
        },
        "required": ["sessionId", "sessionNum", "subSession", "date", "audioUrl", "jsonUrl"]
      }
    }
  },
  "required": ["courseId", "title", "sessions"]
}
```

---

## 2. 科判章節目錄 Schema (`toc.json`)

存放於 `courses/[課程名稱]/toc.json`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "CourseTOC",
  "type": "object",
  "properties": {
    "courseId": { "type": "string" },
    "sections": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "title": { "type": "string", "example": "第六地「現前地」之訓釋" },
          "sessionId": { "type": "string", "example": "01" },
          "timestamp": { "type": "number", "example": 690 },
          "children": {
            "type": "array",
            "items": { "$ref": "#/properties/sections/items" }
          }
        },
        "required": ["title", "timestamp"]
      }
    }
  },
  "required": ["courseId", "sections"]
}
```

---

## 3. 單堂逐字稿 Schema (`session_XX.json`)

存放於 `courses/[課程名稱]/sessions/session_[sessionId].json`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "SessionTranscript",
  "type": "object",
  "properties": {
    "sessionId": { "type": "string", "example": "02A" },
    "title": { "type": "string", "example": "第 2A 堂 (上) | 2016-05-28 | p.63" },
    "audioUrl": { "type": "string" },
    "paragraphs": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": { "type": "string", "example": "p-1" },
          "start": { "type": "number", "example": 0.0 },
          "end": { "type": "number", "example": 14.5 },
          "sentences": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "start": { "type": "number" },
                "end": { "type": "number" },
                "text": { "type": "string" }
              },
              "required": ["start", "end", "text"]
            }
          }
        },
        "required": ["id", "start", "end", "sentences"]
      }
    }
  },
  "required": ["sessionId", "paragraphs"]
}
```
