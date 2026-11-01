export const duration = 60,
  fps = 30;
export const captions = [
  {
    start: 0,
    end: 6,
    zh: "号码公开，还要能自己重算。",
    en: "Public numbers should be reproducible.",
  },
  {
    start: 6,
    end: 12,
    zh: "先核对售前承诺与独立日志。",
    en: "Check commitments and independent log receipts.",
  },
  {
    start: 12,
    end: 18,
    zh: "依赖已安装，运行离线核验。",
    en: "Dependencies installed. Run the offline verifier.",
  },
  {
    start: 18,
    end: 24,
    zh: "验证签名、输入和承诺。",
    en: "Check signatures, inputs and commitments.",
  },
  {
    start: 24,
    end: 32,
    zh: "11 项检查通过，复算全部玩法。",
    en: "11 checks pass. Reproduce all 16 number formats.",
  },
  {
    start: 32,
    end: 38,
    zh: "只改随机数的一个字符。",
    en: "Change one character in the revealed nonce.",
  },
  {
    start: 38,
    end: 46,
    zh: "核验失败，篡改结果被拒绝。",
    en: "Verification fails. The altered proof is rejected.",
  },
  {
    start: 46,
    end: 52,
    zh: "根权限与拒绝揭晓仍是边界。",
    en: "Root control and withheld reveals remain risks.",
  },
  {
    start: 52,
    end: 60,
    zh: "下载证据，独立复算，提出质疑。",
    en: "Clone the evidence. Reproduce the draw. Review it.",
  },
];
export const hits = [0, 6, 12, 18, 24, 28, 32, 36, 38, 46, 52, 54, 56];
