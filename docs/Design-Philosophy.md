# Design Philosophy

> Zivith Product Philosophy
>
> Version: 1.0
>
> Status: Draft
>
> Last Updated: 2026-07

---

# Why Zivith Exists

Most AI video products are built around a single interaction.

```
Prompt
    ↓
Video
```

While simple, this workflow hides the creative process.

When the generated result is unsatisfactory, creators often have to regenerate everything from scratch.

Creative decisions disappear behind a black box.

Zivith takes a different approach.

Instead of treating AI as a video generator, Zivith treats AI as a creative partner throughout the entire filmmaking process.

Every creative artifact should remain editable, reusable and reviewable.

The goal is not only to generate videos.

The goal is to build an AI-native creative operating system for storytelling.

---

# Creative Hierarchy

Every project follows the same creative hierarchy.

```
Project
    ↓
Story
    ↓
Scene
    ↓
Shot
    ↓
Video
```

Each level has a clear responsibility.

This hierarchy represents the filmmaking process rather than the generation process.

---

# Project

A Project represents an entire creative universe.

A Project is not a video project.

It is the persistent workspace of one IP.

A Project owns:

- Knowledge
- Characters
- Locations
- Assets
- Stories
- Generated Outputs

Projects are designed to evolve continuously.

---

# Story

A Story represents a complete narrative unit.

Depending on the project, a Story may represent:

- A movie
- An episode
- A chapter
- A commercial
- A music video
- Any complete storytelling unit

Stories organize narratives.

---

# Scene

A Scene represents one continuous storytelling environment.

Normally a Scene contains:

- One location
- One atmosphere
- One time period
- Multiple Shots

Scenes provide shared context for their Shots.

AI may automatically divide Stories into Scenes, while users always own the final editing authority.

---

# Shot

Shot is the smallest editable creative unit.

Shot is the core object of the entire system.

Every Shot may contain:

- Character State
- Location
- Camera
- Composition
- Action
- Dialogue
- Emotion
- Lighting
- Audio
- Prompt
- References
- Generated Outputs

Every video is generated from one or more Shots.

Never the opposite.

---

# Video

Video is an output.

It is never the source of truth.

Videos can always be regenerated from their corresponding Shot.

---

# Design Principles

## Project Is A Creative Universe

Projects represent long-term creative worlds rather than one-time productions.

Knowledge, assets and creative history belong to the Project.

---

## Story Before Video

Every creation begins with storytelling.

Video generation is the final stage of creation rather than the starting point.

---

## AI Generates, Human Directs

AI assists throughout the creative workflow.

It can generate stories, scenes, shots and videos.

Humans remain responsible for reviewing, editing and making creative decisions.

AI accelerates creativity.

It never replaces creativity.

---

## Human Owns Creative Decisions

AI is capable of completing the creative workflow autonomously.

However, AI generation is inherently probabilistic.

The purpose of human review is not to slow down the workflow,
but to ensure creative quality and artistic consistency.

Users may choose different levels of automation for different stages.

AI proposes.

Humans decide.

---

## Quality Before Automation

Automation is a means, not a goal.

If AI consistently produces satisfactory results,
users may choose a fully automated workflow.

When creative quality is uncertain,
every stage should remain reviewable and editable.

Automation should never replace creative judgment.

---

## Shot Is The Source Of Truth

Shot is the source of truth for visual creation.

Videos are outputs.

Shots are editable.

Videos are reproducible.

Every generated result can always be traced back to its Shot.

---

## Assets Are Persistent

Characters.

Locations.

Knowledge.

Reference Images.

Videos.

Audio.

Music.

Documents.

These are long-term creative assets.

They belong to the Project rather than individual Stories.

Assets are designed for reuse across the entire creative universe.

---

## Everything Is Editable

No AI output should become a dead end.

Stories can be rewritten.

Scenes can be reorganized.

Shots can be refined.

Prompts can be adjusted.

Videos can be regenerated.

Every AI output should become the input of the next iteration.

---

## Transparency Over Magic

AI should not behave like an invisible black box.

Creators should always understand:

- what AI generated
- why it generated it
- where the result came from

Transparency builds trust.

Editable workflows build creativity.

---

## Progressive Professionalism

Zivith should be approachable for beginners while remaining powerful for professionals.

New users should never feel overwhelmed.

Professional creators should never feel limited.

The interface progressively reveals advanced capabilities as users dive deeper into the creative workflow.

---

## Simple by Default

The default workflow should be simple.

Creators think in:

```
Story
    ↓
Scene
    ↓
Shot
```

instead of technical parameters.

---

## Powerful When Needed

Every Shot can be opened inside the Shot Editor.

Advanced users may edit:

- Camera
- Composition
- Character
- Action
- Emotion
- Lighting
- Prompt
- Audio
- References
- Outputs

Without sacrificing the simplicity of the overall workflow.

---

# Vision

Zivith is not an AI chatbot.

Zivith is not a video editor.

Zivith is not an AI video generator.

Zivith is an AI-native Film Production Studio.

It manages the entire creative process rather than only generating the final result.

The mission of Zivith is to make filmmaking programmable, collaborative and continuously evolvable through AI.