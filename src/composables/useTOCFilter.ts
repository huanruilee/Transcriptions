export interface TOCNodeItem {
  id: string;
  title: string;
  start_time: number;
  end_time: number;
  depth: number;
  [key: string]: any;
}

export function filterSessionTOCNodes(
  nodes: TOCNodeItem[],
  sessionStart: number,
  sessionEnd: number,
  mode: 'session' | 'all'
): TOCNodeItem[] {
  if (!nodes || !Array.isArray(nodes)) return [];
  if (mode === 'all') {
    return nodes;
  }
  return nodes.filter(node => {
    // 檢查是否有重疊區間
    const overlap = node.start_time <= sessionEnd && node.end_time >= sessionStart;
    return overlap;
  });
}
