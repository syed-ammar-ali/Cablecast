/**
 * Telegram notification helpers — native fetch only, zero SDK overhead.
 *
 * Environment variables:
 *   TELEGRAM_BOT_TOKEN — Bot API token from @BotFather
 *   TELEGRAM_CHAT_ID   — Default numeric recipient chat ID
 */

const TELEGRAM_API_BASE = "https://api.telegram.org";

function getBotToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not configured.");
  return token;
}

export function isTelegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN);
}

export function getDefaultTelegramChatId(): string | undefined {
  return process.env.TELEGRAM_CHAT_ID;
}

export interface TelegramButton {
  text: string;
  url?: string;
}

export interface SendTelegramOptions {
  parseMode?: "HTML" | "MarkdownV2";
  buttons?: TelegramButton[][];
  disableWebPagePreview?: boolean;
}

/**
 * Sends a text message to a Telegram chat.
 */
export async function sendTelegramMessage(
  chatId: string,
  text: string,
  options: SendTelegramOptions = {},
): Promise<{ success: boolean; messageId?: number; error?: string }> {
  try {
    const token = getBotToken();
    const payload: Record<string, any> = {
      chat_id: chatId,
      text,
      parse_mode: options.parseMode ?? "HTML",
    };

    if (options.disableWebPagePreview) {
      payload.disable_web_page_preview = true;
    }

    if (options.buttons && options.buttons.length > 0) {
      payload.reply_markup = {
        inline_keyboard: options.buttons,
      };
    }

    const res = await fetch(`${TELEGRAM_API_BASE}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      console.error("[Telegram] sendMessage failed:", data);
      return { success: false, error: data.description ?? `HTTP ${res.status}` };
    }

    return { success: true, messageId: data.result?.message_id };
  } catch (err) {
    console.error("[Telegram] Unexpected error:", err);
    return { success: false, error: String(err) };
  }
}

/**
 * Sends a photo with an optional caption to a Telegram chat.
 * If the photo URL fails to load (e.g. invalid TMDB link), falls back to plain text sendMessage.
 */
export async function sendTelegramPhoto(
  chatId: string,
  photoUrl: string,
  caption?: string,
  options: SendTelegramOptions = {},
): Promise<{ success: boolean; messageId?: number; error?: string }> {
  try {
    const token = getBotToken();
    const payload: Record<string, any> = {
      chat_id: chatId,
      photo: photoUrl,
      caption,
      parse_mode: options.parseMode ?? "HTML",
    };

    if (options.buttons && options.buttons.length > 0) {
      payload.reply_markup = {
        inline_keyboard: options.buttons,
      };
    }

    const res = await fetch(`${TELEGRAM_API_BASE}/bot${token}/sendPhoto`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) {
      console.warn("[Telegram] sendPhoto failed, falling back to text:", data.description);
      // Fallback to text message if image fails to render
      if (caption) {
        return sendTelegramMessage(chatId, caption, options);
      }
      return { success: false, error: data.description ?? `HTTP ${res.status}` };
    }

    return { success: true, messageId: data.result?.message_id };
  } catch (err) {
    console.error("[Telegram] Unexpected error:", err);
    if (caption) {
      return sendTelegramMessage(chatId, caption, options);
    }
    return { success: false, error: String(err) };
  }
}
