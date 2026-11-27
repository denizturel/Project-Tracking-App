import * as DocumentPicker from 'expo-document-picker';
import { Linking } from 'react-native';

import { supabase } from '@/lib/supabase';

/** A file, picture or voice message that belongs to a chat message. */
export type Attachment = {
  id: string;
  message_id: string;
  kind: 'file' | 'image' | 'voice' | 'link' | 'google_file';
  storage_path: string | null;
  url: string | null;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  duration_seconds: number | null;
  created_at?: string;
};

export const ATTACHMENT_COLUMNS = 'id, message_id, kind, storage_path, url, file_name, mime_type, size_bytes, duration_seconds, created_at';

/** What is waiting to be sent: a picked file, or a voice message that was just recorded. */
export type Outgoing = {
  name: string;
  mimeType: string;
  size: number;
  /** A File or Blob on the website, a local address on phones. */
  body: Blob | { uri: string };
  voiceSeconds?: number;
};

export const MAX_FILE = 50 * 1024 * 1024;
/** The longest voice message, in seconds (the database refuses longer ones). */
export const MAX_VOICE = 300;

export function sizeText(bytes: number | null | undefined) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function clock(seconds: number | null | undefined) {
  const total = Math.max(0, Math.round(seconds ?? 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** Lets the person choose one file. Gives null when they close the chooser, or the reason it cannot be sent. */
export async function pickFile(): Promise<Outgoing | { problem: string } | null> {
  const result = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true });
  if (result.canceled) return null;
  const asset = result.assets[0];
  if ((asset.size ?? 0) > MAX_FILE) return { problem: 'That file is larger than 50 MB.' };
  return {
    name: asset.name,
    mimeType: asset.mimeType ?? 'application/octet-stream',
    size: asset.size ?? 0,
    body: asset.file ?? { uri: asset.uri },
  };
}

/** Stores the file and ties it to the message. Gives the reason when it fails. */
export async function saveAttachment(conversationId: string, messageId: string, file: Outgoing): Promise<string | null> {
  const safeName = file.name.replace(/[^\w.-]+/g, '_').slice(-80);
  // The second folder is the chat's id: the storage rules let only people of that chat read or add.
  const path = `chat/${conversationId}/${Date.now()}-${safeName}`;
  const body = 'uri' in file.body ? await (await fetch(file.body.uri)).arrayBuffer() : file.body;
  const uploaded = await supabase.storage.from('attachments').upload(path, body, { contentType: file.mimeType });
  if (uploaded.error) return uploaded.error.message;
  const kind = file.voiceSeconds !== undefined ? 'voice' : file.mimeType.startsWith('image/') ? 'image' : 'file';
  const { error } = await supabase.from('attachments').insert({
    message_id: messageId,
    conversation_id: conversationId,
    kind,
    storage_path: path,
    file_name: file.name,
    mime_type: file.mimeType,
    size_bytes: file.size || null,
    duration_seconds: file.voiceSeconds === undefined ? null : Math.min(MAX_VOICE, Math.max(1, Math.round(file.voiceSeconds))),
  });
  return error?.message ?? null;
}

/** Addresses that open a stored file for an hour, remembered so a chat does not ask twice. */
const opened = new Map<string, { url: string; until: number }>();

export async function fileUrl(path: string): Promise<string | null> {
  const known = opened.get(path);
  if (known && known.until > Date.now()) return known.url;
  const { data } = await supabase.storage.from('attachments').createSignedUrl(path, 3600);
  if (!data) return null;
  opened.set(path, { url: data.signedUrl, until: Date.now() + 50 * 60 * 1000 });
  return data.signedUrl;
}

/** Opens the file in the browser or the phone's own viewer. Gives the reason when it cannot. */
export async function openAttachment(item: Attachment): Promise<string | null> {
  const url = item.url ?? (item.storage_path ? await fileUrl(item.storage_path) : null);
  if (!url) return 'This file could not be opened.';
  return Linking.openURL(url).then(
    () => null,
    () => 'This file could not be opened.',
  );
}

/** Web addresses written in a message, for the Links list. */
export function linksIn(text: string | null | undefined): string[] {
  return (text ?? '').match(/https?:\/\/[^\s<>"')]+/g) ?? [];
}
