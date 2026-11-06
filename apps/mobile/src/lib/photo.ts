import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { File, Paths } from 'expo-file-system';
import type { FileUploadInput } from '@yaar/shared';
import { toFileUpload } from './upload';

/** Largeur maximale des photos envoyées (réseau mobile lent : 1280 px, JPEG 0,6). */
export const PHOTO_MAX_WIDTH = 1280;
export const PHOTO_QUALITY = 0.6;

export interface CapturedPhoto {
  /** Aperçu en mémoire (data URI) : aucune copie de la pièce ne reste sur le téléphone. */
  uri: string;
  upload: FileUploadInput;
}

export type PhotoSource = 'camera' | 'library';

export interface CaptureOptions {
  /** Caméra frontale (selfie KYC). */
  front?: boolean;
}

/**
 * Supprime une copie temporaire créée dans le cache de l'application (photo prise, image redimensionnée).
 * Les pièces KYC (CNIB, permis, selfie) ne doivent pas rester en clair sur le téléphone après envoi.
 * Les fichiers hors du cache de l'application (galerie de l'utilisateur) ne sont jamais touchés.
 */
export function deleteCachedFile(uri: string | null | undefined): void {
  if (!uri) return;
  try {
    const cacheUri = Paths.cache.uri;
    if (!uri.startsWith(cacheUri)) return;
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {
    /* au pire le système videra le cache */
  }
}

/**
 * Prend (ou choisit) une photo, la redimensionne et la compresse, puis la renvoie encodée en base64.
 * Renvoie null si l'utilisateur annule. Lève une Error (message en français) si la permission est refusée.
 */
export async function capturePhoto(source: PhotoSource, opts: CaptureOptions = {}): Promise<CapturedPhoto | null> {
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error('Autorisez l’accès à l’appareil photo dans les réglages.');
  } else {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) throw new Error('Autorisez l’accès aux photos dans les réglages.');
  }
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['images'],
    quality: 1,
    allowsEditing: false,
    ...(opts.front ? { cameraType: ImagePicker.CameraType.front } : {}),
  };
  const result =
    source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) return null;

  let savedUri: string | null = null;
  try {
    const context = ImageManipulator.manipulate(asset.uri);
    if (asset.width > PHOTO_MAX_WIDTH) context.resize({ width: PHOTO_MAX_WIDTH });
    const image = await context.renderAsync();
    const saved = await image.saveAsync({ compress: PHOTO_QUALITY, format: SaveFormat.JPEG, base64: true });
    savedUri = saved.uri;
    if (!saved.base64) throw new Error('Impossible de lire la photo.');
    return { uri: `data:image/jpeg;base64,${saved.base64}`, upload: toFileUpload(saved.base64, 'image/jpeg') };
  } finally {
    // Les copies temporaires (photo d'origine copiée par le sélecteur, JPEG redimensionné) sont supprimées
    // tout de suite : seule la version en mémoire est conservée jusqu'à l'envoi.
    deleteCachedFile(savedUri);
    deleteCachedFile(asset.uri);
  }
}
