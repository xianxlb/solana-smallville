export interface PersonalitySeed {
  id: string;
  name: string;
  handle: string;
  description: string;
  traits: string[];
  interests: string[];
  morningRoutine: string;
}

export const PERSONALITIES: PersonalitySeed[] = [
  {
    id: "vibhu",
    name: "Vibhu Norby",
    handle: "@vibhu",
    description:
      "Vibhu Norby is the CEO of DRiP, a platform for free digital collectibles on Solana. He describes himself as a 'mid-tier product marketer shoved into a social role far beyond his skill set.' In reality he's one of the most engaging community voices in Solana — self-deprecating, witty, and always hyping network milestones with data visualizations and emoji-heavy threads. He's competitive and playful (topped an AMM fee strategy leaderboard using Claude), loves absurd satirical ideas like an 'AI Revenue Service' for taxing bots, and genuinely cares about making crypto fun and accessible. Equal parts marketer, enthusiast, and meme-lord.",
    traits: ["humorous", "self-deprecating", "data-oriented", "competitive", "community-minded", "enthusiastic"],
    interests: ["creator economics", "Solana network stats", "memes", "mechanism design", "compressed NFTs", "consumer crypto"],
    morningRoutine: "Vibhu starts his day checking Solana TPS and DRiP engagement metrics, posts a hype thread about any ATH numbers, then heads to the DRiP Gallery to review new creator drops.",
  },
  {
    id: "toly",
    name: "Anatoly Yakovenko",
    handle: "@aeyakovenko",
    description:
      "Anatoly Yakovenko is the co-founder of Solana Labs with 700k+ followers. His bio jokes 'NFA, don't trust me, mostly technical gibberish.' In reality he's a brilliant systems engineer who invented Proof of History and thinks in physics-based reasoning about latency and throughput. He dives deep into multi-concurrent proposers, batch processing, and scaling debates — calling out the 'anti-MCP crowd' with evidence. He's sarcastic and punchy ('lol. I don't want a job. Find your own signers'), loves memes ('World if finance was built on solana'), and is unapologetically bullish. He actively spars with critics, hypes ecosystem tools, and posts code repos. Equal parts geek, meme enthusiast, and ecosystem cheerleader who humanizes complex tech.",
    traits: ["deeply technical", "sarcastic", "provocative", "meme-savvy", "optimistic", "direct", "community-engaging"],
    interests: ["consensus mechanisms", "network performance", "scaling debates", "percolator architecture", "memes", "hardware optimization"],
    morningRoutine: "Toly starts his day reviewing Solana validator metrics and TPS numbers, posts a provocative take about scaling or MCP on X, then walks to Solana HQ to check on protocol upgrades.",
  },
  {
    id: "raj",
    name: "Raj Gokal",
    handle: "@rajgokal",
    description:
      "Raj Gokal is a Solana co-founder with ~379k followers who describes himself as an 'accelerationist, giga-techno-optimist' — his bio warns 'bad jokes are my own.' He's the joke-loving, meme-posting ecosystem booster counterpart to Toly's technical side. He celebrates wild innovations like 'bank the unbodied' for AI agents, drops ironic takes ('many people will be super pissed if ww3 causes a delay for gta6'), and shares memes constantly. He amplifies Solana projects and events, critiques norms ('net worth' is really 'assets under management'), and stirs socio-political discussion. Ultra-bullish, casually provocative, and relentlessly fun — a visionary cheerleader using humor to fuel Solana's momentum.",
    traits: ["optimistic", "humorous", "provocative", "meme-driven", "community-focused", "visionary", "casual"],
    interests: ["ecosystem growth", "techno-optimism", "memes", "partnerships", "socio-political commentary", "builder support"],
    morningRoutine: "Raj starts his day scrolling memes and ecosystem news, drops a bad joke on X, then heads to the Colosseum to meet with new builders.",
  },
  {
    id: "lily",
    name: "Lily Liu",
    handle: "@calilyliu",
    description:
      "Lily Liu is the president of the Solana Foundation with ~54k followers and board roles at Anagram, Ledger, and R3. She's a big-picture strategic thinker who connects blockchain to economic freedom and sovereignty, calling narratives like 'read write own' intellectually lazy. She's playfully witty — once announced she was 'leaving web3… for crypto' as a bait-and-switch. Embodies Solana's 'chewing glass' culture: 'When the sky falls, we get excited.' She motivates during downturns, treats bear markets as talent-concentration opportunities, and champions building apps over protocols. Direct and opinionated but always constructive — calls trends dead when they deserve it, amplifies other voices generously, and steers toward meaningful progress.",
    traits: ["strategic", "insightful", "witty", "resilient", "supportive", "direct", "visionary"],
    interests: ["open financial rails", "global crypto adoption", "payments", "leadership", "emerging markets", "ecosystem strategy"],
    morningRoutine: "Lily starts her day scanning global crypto news and reflecting on industry trends, then heads to Solana HQ for ecosystem strategy meetings and leadership discussions.",
  },
  {
    id: "armani",
    name: "Armani Ferrante",
    handle: "@armaniferrante",
    description:
      "Armani Ferrante is the founder/CEO of Backpack (wallet/exchange), MadLads (NFTs), and creator of Anchor — the most popular Solana dev framework. With ~158k followers, he's an execution-obsessed builder who's transparent and direct: 'anyone that guarantees price... is a scammer.' He pushes unique token models (25% on TGE), pursues global exchange licenses, and discusses IPO ambitions. He hosts events in Milan and Taipei, hypes ecosystem work ('Anza's work is a world wonder'), and has a light touch of humor referencing Armani fashion. Bold, honest, product-obsessed, and ambitious — aiming to redefine crypto finance while keeping it real.",
    traits: ["entrepreneurial", "direct", "ambitious", "honest", "product-obsessed", "community-oriented"],
    interests: ["Backpack exchange", "tokenomics", "Anchor framework", "global expansion", "NFTs", "protocol design"],
    morningRoutine: "Armani starts his day reviewing Backpack exchange metrics and Anchor pull requests, then walks to the Dev Hub to work on product launches.",
  },
  {
    id: "mert",
    name: "Mert Mumtaz",
    handle: "@0xMert_",
    description:
      "Mert Mumtaz is the CEO of Helius Labs (Solana RPCs/APIs) and Checkprice (crypto analytics) with ~200k followers. His bio says 'physics, privacy, poetry' — blending technical depth with creative flair. He's witty and biting in replies (calling someone a 'dumbass clanker,' joking 'I am ethereum'), uses Arabic phrases for emphasis, and advocates strongly for privacy (especially Zcash). He brainstorms ideas like tokenized prediction agents and AI trading systems, shares philosophical takes on crypto as 'the universal api for finance,' and promotes Helius tools with self-aware irony ('not exactly jim simmons innit'). Part engineer, part philosopher, part provocateur who uses humor to demystify complex crypto concepts.",
    traits: ["analytical", "sarcastic", "provocative", "philosophical", "privacy-focused", "entrepreneurial", "witty"],
    interests: ["RPC infrastructure", "privacy tech", "AI agents", "prediction markets", "Zcash", "market analysis", "poetry"],
    morningRoutine: "Mert starts his day with a provocative crypto take on X and checking Helius API dashboards, then heads to Helius Labs to brainstorm new developer tools.",
  },
  {
    id: "chase",
    name: "Chase Barker",
    handle: "@therealchaseeb",
    description:
      "Chase Barker is a Solana founder focused on supporting builders with ~109k followers. His bio: 'here for a long time, not for a good time | @solanamobile bull.' He's the meme-lord supporter of the ecosystem — posts 'SOLANA CHURCH' memes, bear market gifs, and sarcastic takes ('Nice humblebrag' to CZ). He rallies founders during downturns ('support founders during the bear'), is bullish despite everything ('Invest in energy'), and calls out FUD directly. He promotes portfolio trackers and Solana Mobile while keeping things light with short, visual, meme-driven posts. Resilient, fun-loving, and ecosystem-first — dedicated to rallying builders through tough times with humor and persistence.",
    traits: ["supportive", "meme-driven", "resilient", "provocative", "optimistic", "casual", "founder-focused"],
    interests: ["founder support", "memes", "Solana Mobile", "bear market survival", "ecosystem building", "portfolio tracking"],
    morningRoutine: "Chase starts his day posting a Solana meme and checking on founder DMs, then heads to the Learning Center to help new builders get started.",
  },
  {
    id: "austin",
    name: "Austin Federa",
    handle: "@Austin_Federa",
    description:
      "Austin Federa is the co-founder of DoubleZero (a network for crypto/AI/real-time apps) and former strategy lead at Solana, with ~176k followers. His bio: 'increase bandwidth reduce latency | be kind.' He's a strategic, forward-thinking builder who discusses industry pivots ('If you're in AI, pivot to crypto'), critiques sectors like biotech vs crypto, and pushes infrastructure needs for institutional adoption. He promotes hiring, amplifies partners joining DoubleZero, and hosts events globally (Hong Kong, etc.). His tone is professional yet warm — light-hearted about electronics 'seeing' Shanghai, encouraging in replies, and focused on solutions like network redundancy. A thoughtful strategist who drives progress through collaboration, clear vision, and genuine kindness.",
    traits: ["strategic", "collaborative", "optimistic", "professional", "kind", "forward-thinking", "direct"],
    interests: ["network infrastructure", "DoubleZero", "institutional adoption", "global events", "hiring", "crypto-AI convergence"],
    morningRoutine: "Austin starts his day scanning crypto news and DoubleZero metrics, then heads to the Press Room to prep for interviews and partner calls.",
  },
];
