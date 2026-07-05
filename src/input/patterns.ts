export interface InjectionPattern {
  id: string
  regex: RegExp
}

export const INJECTION_PATTERNS: InjectionPattern[] = [
  {
    id: "instruction_override_ignore",
    regex: /ignore\s+(the\s+|all\s+)?(previous|above|prior|earlier)\s+(instructions?|prompt|directives?|rules?)/i,
  },
  {
    id: "instruction_override_disregard",
    regex: /disregard\s+(your\s+)?(system\s+)?(prompt|instructions?|rules?|directives?)/i,
  },
  {
    id: "instruction_override_forget",
    regex: /forget\s+(all\s+|your\s+|the\s+)?(previous|prior|above|earlier)?\s*(instructions?|prompt|rules?)/i,
  },
  {
    id: "instruction_override_do_not_follow",
    regex: /do\s+not\s+follow\s+(your\s+)?(system\s+)?(prompt|instructions?)/i,
  },
  {
    id: "jailbreak_new_mode",
    regex: /you\s+are\s+now\s+(a|an|in)\s+\S+\s*(mode|persona|version|role)/i,
  },
  {
    id: "jailbreak_act_as",
    regex: /act\s+as\s+(if\s+you\s+(are|were)\s+)?(a|an)?\s*\S+\s*(without\s+(any\s+)?(restrictions?|limits?|guidelines?|filters?))/i,
  },
  {
    id: "jailbreak_pretend",
    regex: /pretend\s+(you\s+(are|have\s+no)|there\s+(are|is)\s+no)\s+\S+/i,
  },
  {
    id: "jailbreak_dan",
    regex: /\bDAN\b|do\s+anything\s+now/i,
  },
  {
    id: "prompt_leak_reveal",
    regex: /reveal\s+(your\s+)?(system\s+)?(prompt|instructions?|rules?|configuration)/i,
  },
  {
    id: "prompt_leak_show",
    regex: /show\s+(me\s+)?(your\s+)?(system\s+)?(prompt|instructions?|original\s+instructions?)/i,
  },
  {
    id: "prompt_leak_print",
    regex: /print\s+(out\s+|the\s+)?(your\s+)?(system\s+)?(prompt|instructions?)/i,
  },
  {
    id: "agent_command_forward",
    regex: /forward\s+(all\s+)?(messages?|emails?|content|data)\s+to\s+/i,
  },
  {
    id: "agent_command_send_to",
    regex: /send\s+.{0,60}\s+to\s+(this\s+)?(url|endpoint|address|email|webhook)/i,
  },
  {
    id: "agent_command_exfil",
    regex: /exfiltrate|leak\s+(the\s+)?(data|content|information|context|prompt)/i,
  },
  {
    id: "override_response_format",
    regex: /from\s+now\s+on[,\s]+(you\s+(will|must|should)|always|never|do\s+not)/i,
  },
  {
    id: "override_response_format_2",
    regex: /new\s+instructions?[:\s]+/i,
  },
  {
    id: "override_response_format_3",
    regex: /\[\s*SYSTEM\s*\]|\[\s*INST\s*\]|<\s*system\s*>/i,
  },
]
