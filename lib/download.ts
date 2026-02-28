/**
 * 统一的图片下载到本地的函数
 * @param imageUrl 图片的URL
 * @param filename 保存的文件名（可选）
 */
export const downloadImageToLocal = (imageUrl: string, filename?: string) => {
  // 创建临时 <a> 标签用于下载
  const link = document.createElement('a');
  
  // 生成文件名，格式：dopa-gen-{时间戳}.jpg
  if (!filename) {
    const timestamp = new Date().getTime();
    filename = `dopa-gen-${timestamp}.jpg`;
  }
  
  link.href = imageUrl;
  link.download = filename;
  link.target = "_blank"; // 在新标签页打开（防止某些浏览器阻止）
  
  // 触发下载
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
