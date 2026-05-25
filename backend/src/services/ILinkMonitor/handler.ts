/**
 * ILinkMonitor Handler — 消息处理
 */
import { logger } from '../../utils/logger';
import { getErrorMessage } from '../../types/ilink';
import { ILinkConfig } from './config';
import { sendMessage, sendTyping, getConfig, downloadImageAsBase64 } from './api';

export async function handleIncomingMessage(config: ILinkConfig, msg: unknown): Promise<void> {
  const m = msg as Record<string, unknown>;
  const fromUserId = m.from_user_id as string | undefined;
  if (!fromUserId) return;

  const contextToken = m.context_token || '';

  // 提取文本和图片内容
  let text = '';
  const imageUrls: string[] = [];

  if (m.item_list && Array.isArray(m.item_list)) {
    for (const item of m.item_list as Array<Record<string, unknown>>) {
      const textItem = item.text_item as Record<string, unknown> | undefined;
      if (item.type === 1 && textItem?.text) text += textItem.text as string;
      if (item.type === 2 && item.image_item) {
        try {
          const base64 = await downloadImageAsBase64(config, item.image_item);
          if (base64) {
            imageUrls.push(base64);
            logger.info(`[iLink] Downloaded image from ${fromUserId.slice(0, 15)}...`);
          }
        } catch (e: unknown) {
          logger.error(`[iLink] Image download failed: ${getErrorMessage(e)}`);
        }
      }
    }
  }

  if (!text && imageUrls.length === 0) return;
  if (!text && imageUrls.length > 0) text = '请分析这张图片';

  logger.info(`[iLink] Incoming from ${fromUserId.slice(0, 15)}...: text="${text.slice(0, 50)}" images=${imageUrls.length}`);

  // 获取 typing_ticket 并发送 typing 状态
  let typingTicket = '';
  try {
    const configResp = await getConfig(config, fromUserId as string, typeof contextToken === 'string' ? contextToken : undefined) as Record<string, unknown> | undefined;
    typingTicket = (configResp?.typing_ticket as string) || '';
  } catch (err) { logger.warn(`[iLink] getConfig for typing failed: ${err}`); }
  if (typingTicket) sendTyping(config, fromUserId, typingTicket).catch((err) => logger.warn(`[iLink] sendTyping failed: ${err}`));

  // 调用 wechatIncoming 处理逻辑
  try {
    const { handleILinkMessage } = await import('../../routes/wechatIncoming');
    const reply = await handleILinkMessage(fromUserId, text, m.create_time_ms as number | undefined, imageUrls);
    if (reply) {
      await sendMessage(config, fromUserId, reply, contextToken as string | undefined);
      logger.info(`[iLink][RC-ILinkMonitor] Reply sent to ${fromUserId.slice(0, 15)}...`);
    }
  } catch (e: unknown) {
    logger.error(`[iLink] handleIncomingMessage error: ${getErrorMessage(e)}`);
    await sendMessage(config, fromUserId, '⚠️ 系统处理异常，请稍后重试', contextToken as string | undefined);
  }
}
