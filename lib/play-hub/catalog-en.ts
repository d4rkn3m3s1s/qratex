/**
 * Oyun merkezi EN metinleri: oyun adı/açıklaması ve başarım adları sunucu yapılandırmasından
 * (lib/minigame-config.ts, lib/game-achievements.ts) Türkçe gelir. EN arayüzde yalnız VARSAYILAN
 * Türkçe metin çevrilir; admin'in elle değiştirdiği başlık/açıklama olduğu gibi gösterilir.
 */
import { getGameDef } from '@/lib/minigame-config';
import { ACHIEVEMENTS } from '@/lib/game-achievements';
import type { GamesTabData } from '@/lib/play-hub/server';

export const GAME_EN: Record<string, { title: string; description: string }> = {
  pacman: { title: 'Star Hunt', description: 'Collect the stars and dodge the ghosts: 5 levels, 3 lives. Your first 5 stars earn the reward.' },
  'mind-thief': { title: 'Mind Thief', description: 'Wipe out corrupted reviews before they infect the network — don’t touch the real ones. The boss gets stronger every level!' },
  'truth-vs-fake': { title: 'Real or Fake', description: 'Swipe cards left or right fast: real review or fake? Build combos in 45 seconds and rack up points.' },
  'bot-hunter': { title: 'Bot Hunter', description: 'Spot the fake bots among 6 profiles. Protect the real users before the radar sweep ends!' },
  'review-detective': { title: 'Review Detective', description: 'Become an elite detective: find the fake or AI-written review in the case file. Clues thin out as time runs down!' },
  'spam-defense': { title: 'Spam Defense', description: 'Protect the Qratex Core from spam waves! Shoot incoming bots and survive as the waves get tougher.' },
  'data-miner': { title: 'Data Miner', description: 'Open holographic cubes to find valuable data — but some hide bot traps! Risk and reward are in your hands.' },
  'guardian-of-trust': { title: 'Trust Guardian', description: 'Shield the falling positive reviews with your guard before corrupted ones infect them!' },
  'troll-slayer': { title: 'Troll Slayer Arena', description: 'Battle waves of trolls in the digital arena! Tap to destroy them and survive as long as you can.' },
  'network-defender': { title: 'Network Defender', description: 'Tap nodes to stop the spreading malicious signal! Clean it up before the infection takes over the network.' },
  'combo-tap': { title: 'Combo Star', description: 'Tap the stars as they pop up and keep the combo alive! Test your reflexes, chain hits and multiply your score.' },
  'memory-match': { title: 'Memory Match', description: 'Flip the cards and find matching emoji pairs! Use your memory to clear the board in as few moves as possible.' },
  'speed-order': { title: 'Speed Order', description: 'Tap the numbers in order, starting from 1! Get the sequence right before time runs out — and speed up.' },
  'lucky-wheel': { title: 'Lucky Wheel', description: 'Stop the wheel at the right moment! Hit the green zone, avoid the risky slices and collect points.' },
  'word-spot': { title: 'Spot the Fake', description: 'Find the odd, fake word in the grid! Stay sharp as the rounds speed up.' },
  'data-snake': { title: 'Data Snake', description: 'Steer the snake, swallow data packets and grow! Avoid the bot walls and your own tail.' },
  'review-stack': { title: 'Review Stack', description: 'Rotate and stack the falling review blocks! Fill a row to approve and clear it. Don’t let them pile up.' },
  'trust-merge': { title: 'Trust Merge', description: 'Slide matching tiles to merge them: 2 → 4 → 8… Every merge scores; the reward unlocks at 1,500 points.' },
  'signal-pipe': { title: 'Signal Link', description: 'Rotate the pipes to get the signal from the source to the server! 10 levels on a shared timer; fewer moves earn more stars.' },
  'spam-breaker': { title: 'Spam Breaker', description: 'Slide the paddle, bounce the ball and smash spam and bot bricks across 5 levels! Once you pass the threshold, your score counts even if the ball gets away.' },
  'frost-catcher': { title: 'Snowflake Catch', description: 'Catch falling snowflakes with your mitten in the Frost Kingdom and dodge black ice (−1 life)! The Trust Shield absorbs one hit; build combos and don’t miss the golden crystal.' },
  'fake-hunter': { title: 'Fake Hunter', description: 'Catch the fake in four stages: swipe the review, check the reviewer’s file, find the giveaway sentence, spot the bot. The server calculates your score.' },
  'core-defense': { title: 'Core Defense', description: 'Defend the Qratex core from spam and troll waves: the core has health, 8 waves get harder, and you pick upgrades in between.' },
  'daily-word': { title: 'Word of the Day', description: 'Everyone gets the same 5-letter Turkish word — find it in 6 tries; letters change colour after each guess.' },
  'match-three': { title: 'Match-3', description: 'Swap neighbouring badges to match three or more; hit the level goal before you run out of moves.' },
  'venue-quiz': { title: 'Venue Quiz', description: 'Timed questions about venues and categories; right answers and speed earn points.' },
};

export const ACHIEVEMENT_EN: Record<string, { title: string; description: string }> = {
  'first-win': { title: 'First Victory', description: 'Win your first game.' },
  'win-10': { title: 'Seasoned Player', description: 'Win 10 games.' },
  'win-50': { title: 'Legend', description: 'Win 50 games.' },
  'explorer-5': { title: 'Explorer', description: 'Play 5 different games.' },
  'explorer-all': { title: 'Collector', description: 'Play 10 different games.' },
  'peak-80': { title: 'Sharpshooter', description: 'Reach 80% of the top score in a game.' },
  'peak-100': { title: 'Flawless', description: 'Reach the top score in a game.' },
  'play-25': { title: 'Regular', description: 'Finish 25 games in total.' },
  'streak-3': { title: 'Warming Up', description: 'Build a 3-day streak.' },
  'streak-7': { title: 'Weekly Hero', description: 'Build a 7-day streak.' },
  'streak-30': { title: 'Unstoppable', description: 'Build a 30-day streak.' },
};

/** Varsayılan TR başlığı ise EN karşılığı; admin değiştirdiyse olduğu gibi. */
export function gameTitleFor(gameType: string, title: string, locale: string): string {
  if (locale !== 'en') return title;
  const en = GAME_EN[gameType];
  return en && getGameDef(gameType)?.title === title ? en.title : title;
}

export function gameDescriptionFor(gameType: string, description: string, locale: string): string {
  if (locale !== 'en') return description;
  const en = GAME_EN[gameType];
  return en && getGameDef(gameType)?.description === description ? en.description : description;
}

const ACH_TR = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));

/** Oyun merkezi verisinin görünen oyun/başarım metinlerini arayüz diline çevirir (veri değişmez). */
export function localizeGamesTab(d: GamesTabData, locale: string): GamesTabData {
  if (locale !== 'en') return d;
  const g = <T extends { gameType: string; title: string; description: string }>(x: T): T => ({
    ...x,
    title: gameTitleFor(x.gameType, x.title, locale),
    description: gameDescriptionFor(x.gameType, x.description, locale),
  });
  const tournament = d.tournament.ok
    ? {
        ...d.tournament,
        data: {
          ...d.tournament.data,
          featured: d.tournament.data.featured
            ? { ...d.tournament.data.featured, title: gameTitleFor(d.tournament.data.featured.gameType, d.tournament.data.featured.title, locale) }
            : null,
        },
      }
    : d.tournament;
  const achievements = d.achievements.ok
    ? {
        ...d.achievements,
        data: {
          ...d.achievements.data,
          list: d.achievements.data.list.map((a) => {
            const en = ACHIEVEMENT_EN[a.id];
            const tr = ACH_TR.get(a.id);
            if (!en || !tr) return a;
            return {
              ...a,
              title: a.title === tr.title ? en.title : a.title,
              description: a.description === tr.description ? en.description : a.description,
            };
          }),
        },
      }
    : d.achievements;
  return {
    ...d,
    catalog: d.catalog.map(g),
    featured: d.featured ? g(d.featured) : null,
    tournament,
    achievements,
  };
}
