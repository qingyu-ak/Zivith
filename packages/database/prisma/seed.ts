import argon2 from 'argon2';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  const passwordHash = await argon2.hash('ZivithDemo2026!');
  const user = await prisma.user.upsert({
    where: { email: 'demo@zivith.local' },
    update: {},
    create: { email: 'demo@zivith.local', displayName: '演示创作者', passwordHash },
  });
  const existing = await prisma.project.findFirst({
    where: { ownerId: user.id, name: '西游记：云端重逢', deletedAt: null },
  });
  if (existing) return;

  const project = await prisma.project.create({
    data: {
      ownerId: user.id,
      name: '西游记：云端重逢',
      description: 'Zivith Phase 1 演示项目',
      defaults: { style: { aspect_ratio: '16:9', fps: 24, rendering: 'anime' } },
      members: { create: { userId: user.id, role: 'owner' } },
      assets: {
        create: [
          {
            type: 'character',
            state: 'active',
            name: '孙悟空',
            description: '齐天大圣，敏捷而锐利',
            appearance: { hair: '金棕色毛发', eyes: '金色' },
            data: { personality: '勇敢、机敏', default_outfit: '金甲红披风' },
          },
          {
            type: 'location',
            state: 'active',
            name: '南天门',
            description: '云海之上的宏伟天门',
            data: { type: 'fantasy', mood_default: 'epic' },
          },
        ],
      },
    },
  });
  const story = await prisma.story.create({
    data: {
      projectId: project.id,
      title: '重返天庭',
      synopsis: '孙悟空再次来到南天门。',
      order: 1,
    },
  });
  await prisma.scene.create({
    data: {
      projectId: project.id,
      storyId: story.id,
      title: '云海中的南天门',
      description: '黄昏，云海翻涌。',
      order: 1,
    },
  });
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
