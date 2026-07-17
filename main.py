"""
OV v1.0 - 短剧 AI Agent 后端
V0.1: 小说生成 + 导入 + 审核关口
"""
import json
import os
import uuid
import shutil
from pathlib import Path
from datetime import datetime

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from openai import OpenAI

# ============================================================
# 配置
# ============================================================
DATA_DIR = Path("data")
DATA_DIR.mkdir(exist_ok=True)
STATIC_DIR = Path("static")

# LLM 客户端（DeepSeek 兼容 OpenAI SDK）
LLM_CLIENT = OpenAI(
    api_key=os.getenv("DEEPSEEK_API_KEY", "sk-your-api-key"),
    base_url=os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com"),
)
LLM_MODEL = os.getenv("LLM_MODEL", "deepseek-chat")

app = FastAPI(title="OV v1.0 - 短剧 Agent")

# ============================================================
# 数据模型
# ============================================================
class GenerateRequest(BaseModel):
    user_idea: str = Field(..., description="用户创意描述")
    style_preferences: str = Field(default="", description="风格偏好")

class RejectRequest(BaseModel):
    feedback: str = Field(..., description="驳回修改意见")

class ProjectStatus:
    DRAFT = "draft"
    APPROVED = "approved"
    REJECTED = "rejected"

# ============================================================
# 数据持久化
# ============================================================
def load_project(project_id: str) -> dict:
    path = DATA_DIR / f"{project_id}.json"
    if not path.exists():
        raise HTTPException(status_code=404, detail="项目不存在")
    return json.loads(path.read_text(encoding="utf-8"))

def save_project(project_id: str, data: dict):
    path = DATA_DIR / f"{project_id}.json"
    data["updated_at"] = datetime.now().isoformat()
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

def create_project(source: str) -> str:
    project_id = uuid.uuid4().hex[:8]
    return project_id

# ============================================================
# LLM #1：小说生成
# ============================================================
SYSTEM_PROMPT = """你是一位经验丰富的短剧编剧，擅长用简洁有力的笔触构建画面感强的叙事文本。

## 输出格式要求
你的输出必须严格遵循以下格式：

1. **标题**：以 `# ` 开头，简洁有力
2. **场景标记**：每个场景切换处以 `[场景：场景描述]` 开头
3. **情绪标记**：关键情绪转折处以 `[情绪：情绪词]` 标注
4. **对话**：每个角色的对话独占一行，格式为 `角色名：「对话内容」`
5. **动作描述**：动作和环境描述以叙事段落呈现

## 写作要求
- 字数控制在 800-1500 字
- 至少包含 2-3 个场景切换
- 对话占比不低于 40%
- 画面感强，适合影视化改编
- 在关键情节处埋入一个悬念钩子
- 语言风格：口语化、节奏快，拒绝过分文学化的冗长描写

## 示例片段
```
# 长安雪夜

[场景：长安城南 - 深夜小巷 - 大雪纷飞]

林昭裹紧披风，踏着没过脚踝的积雪向巷子深处走去。身后传来轻微的脚步声。

[情绪：紧张]

林昭：「跟了这么久，出来见个面吧。」

黑影从墙角缓缓走出，手中匕首泛着冷光。

刺客：「林家的事，你不该再查下去。」
```
"""

@app.post("/generate-story")
async def generate_story(req: GenerateRequest):
    """LLM #1 生成章节"""
    project_id = create_project("ai")

    try:
        response = LLM_CLIENT.chat.completions.create(
            model=LLM_MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": f"创意：{req.user_idea}\n风格偏好：{req.style_preferences or '快节奏、画面感强'}",
                },
            ],
            temperature=0.85,
            max_tokens=4096,
        )

        chapter_text = response.choices[0].message.content

        project_data = {
            "id": project_id,
            "source": "ai",
            "user_idea": req.user_idea,
            "style_preferences": req.style_preferences,
            "chapter_text": chapter_text,
            "status": ProjectStatus.DRAFT,
            "created_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat(),
        }
        save_project(project_id, project_data)

        return project_data

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"LLM 调用失败: {str(e)}")

# ============================================================
# 导入文件
# ============================================================
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5MB


def detect_encoding(raw: bytes) -> str:
    """简易编码检测：UTF-8 / GBK"""
    try:
        raw.decode("utf-8")
        return "utf-8"
    except UnicodeDecodeError:
        pass
    try:
        raw.decode("gbk")
        return "gbk"
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="无法识别文件编码，请使用 UTF-8 或 GBK 编码的 .txt/.md 文件")


@app.post("/import-story")
async def import_story(file: UploadFile = File(...)):
    """导入 .txt / .md 文件作为章节内容"""
    # 校验扩展名
    ext = Path(file.filename or "").suffix.lower()
    if ext not in (".txt", ".md"):
        raise HTTPException(status_code=400, detail="仅支持 .txt 和 .md 文件")

    # 读取并检测编码
    raw = await file.read()
    if len(raw) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="文件大小不能超过 5MB")

    encoding = detect_encoding(raw)
    chapter_text = raw.decode(encoding)

    if not chapter_text.strip():
        raise HTTPException(status_code=400, detail="文件内容为空")

    project_id = create_project("import")

    project_data = {
        "id": project_id,
        "source": "import",
        "filename": file.filename,
        "chapter_text": chapter_text,
        "char_count": len(chapter_text),
        "status": ProjectStatus.DRAFT,
        "created_at": datetime.now().isoformat(),
        "updated_at": datetime.now().isoformat(),
    }
    save_project(project_id, project_data)

    return project_data

# ============================================================
# 项目管理接口
# ============================================================
@app.get("/projects/{project_id}")
async def get_project(project_id: str):
    return load_project(project_id)


@app.post("/projects/{project_id}/approve")
async def approve_project(project_id: str):
    project = load_project(project_id)
    project["status"] = ProjectStatus.APPROVED
    save_project(project_id, project)
    return project


@app.post("/projects/{project_id}/reject")
async def reject_story(project_id: str, req: RejectRequest):
    """驳回：带反馈重新生成"""
    project = load_project(project_id)
    project["status"] = ProjectStatus.REJECTED
    project["feedback"] = req.feedback
    save_project(project_id, project)

    # 用反馈重新生成
    if project["source"] == "ai":
        try:
            response = LLM_CLIENT.chat.completions.create(
                model=LLM_MODEL,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {
                        "role": "user",
                        "content": f"创意：{project['user_idea']}\n风格偏好：{project.get('style_preferences', '')}\n\n上次生成的版本被驳回，修改意见：{req.feedback}\n\n请根据修改意见重新创作。",
                    },
                ],
                temperature=0.85,
                max_tokens=4096,
            )
            project["chapter_text"] = response.choices[0].message.content
            project["status"] = ProjectStatus.DRAFT
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"LLM 重生成失败: {str(e)}")

    save_project(project_id, project)
    return project


@app.put("/projects/{project_id}/edit")
async def edit_chapter(project_id: str, data: dict):
    """手动编辑章节文本"""
    project = load_project(project_id)
    if "chapter_text" in data:
        project["chapter_text"] = data["chapter_text"]
        project["status"] = ProjectStatus.DRAFT
    save_project(project_id, project)
    return project


# ============================================================
# 静态文件
# ============================================================
@app.get("/")
async def index():
    return FileResponse(STATIC_DIR / "index.html")


# ============================================================
# 启动
# ============================================================
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=9000, reload=False)
