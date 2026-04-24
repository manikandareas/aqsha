'use client';

import emojiMartData from '@emoji-mart/data';
import { EmojiInputPlugin, EmojiPlugin } from '@platejs/emoji/react';

import { EmojiInputElement } from '@/components/ui/emoji-node';

const emojiData = emojiMartData as unknown as import('@emoji-mart/data').EmojiMartData;

export const EmojiKit = [
  EmojiPlugin.configure({
    options: { data: emojiData },
  }),
  EmojiInputPlugin.withComponent(EmojiInputElement),
];
