# Zivith Design Philosophy

> Version: v0.1
>
> Status: Draft
>
> Last Updated: 2026-07

---

# Chapter 1 · The Creative Hierarchy

## Why Zivith?

Most AI video tools are built around a single interaction.

```
Prompt
    ↓
Video
```

When the generated result is unsatisfactory, users usually have to regenerate everything from scratch.

This workflow treats video generation as a one-time process rather than a creative process.

Zivith takes a different approach.

Instead of generating videos directly, Zivith models the entire filmmaking workflow.

Every creative artifact becomes reusable, editable and reviewable.

The goal of Zivith is not to generate a video.

The goal is to build a complete AI-native film production workflow.

---

# Creative Hierarchy

Every project inside Zivith follows the same creative hierarchy.

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

Each layer represents a different level of abstraction.

---

## Project

A Project is **not** a video.

A Project represents an entire creative universe.

It contains everything required to consistently create content within the same IP.

Examples:

- Journey to the West
- Cyberpunk City
- My Original Novel
- Brand Commercial Campaign

Project owns:

- Knowledge Base
- Characters
- Locations
- Assets
- Stories
- Generated Videos

Projects are designed to evolve over time rather than being discarded after one export.

---

## Story

A Story represents one chapter or one complete narrative.

A Project may contain multiple stories.

Examples:

Journey to the West

- Chapter 1
- Chapter 2
- Chapter 3

A personal novel may also contain dozens of chapters.

Each Story shares the same Project-level knowledge and assets.

---

## Scene

A Scene represents one continuous location or narrative segment.

Examples:

Chapter 1

Scene 1

Flower Fruit Mountain

Scene 2

Heavenly Palace

Scene 3

Dragon Palace

Characters, environments, lighting and atmosphere usually remain stable inside one Scene.

A Scene exists to organize multiple Shots.

---

## Shot

Shot is the smallest creative unit inside Zivith.

Everything eventually becomes a Shot.

A Shot contains:

- Camera
- Composition
- Character State
- Dialogue
- Action
- Prompt
- Video Result

Shots can be regenerated independently.

They can also be reordered, replaced or refined without affecting the rest of the Story.

Shot is the core object of the entire system.

---

## Video

A Video is an output.

It is **not** the source of truth.

Videos can always be regenerated from their corresponding Shot.

This makes future model upgrades possible without losing creative assets.

---

# Design Principles

## Story First

Every creative work begins with a story.

---

## Scene Organizes Narrative

Scenes organize the structure of storytelling.

---

## Shot Is the Core

Every AI operation eventually targets one or more Shots.

---

## Assets Are Persistent

Characters.

Locations.

Knowledge.

Reference Images.

Styles.

These belong to the Project rather than individual Stories.

---

## Outputs Are Disposable

Videos can always be regenerated.

Creative assets should never be lost.

Knowledge is permanent.

Shots are editable.

Videos are reproducible.

---

# Vision

Zivith is not an AI video generator.

Zivith is an AI-native film production studio.

It manages the entire creative process rather than only generating the final result.