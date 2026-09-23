import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

function blobBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Không thể đọc dữ liệu Sổ quỹ'));
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.readAsDataURL(blob);
  });
}

export async function saveCashbookFile(blob: Blob, fileName: string) {
  if (Platform.OS === 'web') {
    if (typeof document === 'undefined') throw new Error('Trình duyệt không hỗ trợ tải file');
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = fileName; document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  const directory = FileSystem.cacheDirectory || FileSystem.documentDirectory;
  if (!directory) throw new Error('Thiết bị không cung cấp thư mục lưu file');
  const uri = directory + fileName.replace(/[^\p{L}\p{N}_.-]+/gu, '_');
  await FileSystem.writeAsStringAsync(uri, await blobBase64(blob), { encoding: FileSystem.EncodingType.Base64 });
  if (!await Sharing.isAvailableAsync()) throw new Error('Thiết bị không hỗ trợ chia sẻ file');
  await Sharing.shareAsync(uri, blob.type ? { mimeType: blob.type } : undefined);
}
