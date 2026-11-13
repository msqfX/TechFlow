import type { TutorialContent } from '@/types/content'

const tutorial: TutorialContent = {
  meta: {
    id: 'tutorial-linked-list',
    slug: 'linked-list',
    title: '链表',
    description:
      '对比数组与链表的内存布局,动画演示头插 O(1)、按下标访问 O(n) 与指针重排删除,理解「查快插慢」与「插快查慢」的取舍。',
    category: 'algorithm',
    difficulty: 'beginner',
    duration: 14,
    tags: ['链表', '指针', '数组对比', 'O(1) 插入', 'LRU'],
    prerequisites: ['stack-queue'],
    relatedTutorials: ['stack-queue', 'bubble-sort', 'quick-sort'],
    sceneType: 'linked-list',
    featured: false,
    order: 16,
  },
  objectives: [
    '理解链表与数组的内存布局差异:连续 vs 指针串联',
    '掌握链表的核心操作:头插 O(1)、按下标访问 O(n)、删除只需重排指针',
    '理解操作复杂度表背后的原因,以及「伪随机访问」为什么链表做不了',
    '认识链表的工程应用:LRU 缓存、消息队列底层、Undo 栈',
  ],
  chapters: [
    {
      id: 'layout',
      title: '内存布局:连续 vs 指针串联',
      body: `**数组**把元素放在一段**连续内存**里 —— 知道下标就能一步算出地址(\`地址 = 首地址 + 下标 × 元素大小\`),所以按下标访问是 **O(1)**(随机访问);但插入/删除中间元素需要整体移位,O(n)。

**链表**把每个节点放在任意位置,节点里存 **值 + 指向下一节点的指针**,靠指针串联:

\`[3 | ●] → [7 | ●] → [12 | ○null]\`

访问第 k 个元素只能**从头顺着指针走 k 步**,O(n);但**插入/删除只需改一两个指针**,拿到位置后是 O(1)。

这就是最基础的取舍:**数组换来了快读慢写,链表换来了快写慢读**。`,
    },
    {
      id: 'ops',
      title: '三个核心操作的复杂度',
      body: `| 操作 | 数组 | 链表 |
|---|---|---|
| 按下标访问 | O(1) | O(n) |
| 头部插入/删除 | O(n)(整体移位) | **O(1)** |
| 尾部插入 | O(1)(有尾指针/扩容均摊) | O(1)(持有尾指针时) |
| 已知位置插入/删除 | O(n)(移位) | **O(1)(重排指针)** |
| 按值查找 | O(n)(可二分优化到 O(log n)) | O(n)(只能顺序走) |

注意一个易错点:「链表插入 O(1)」的前提是**已经走到了插入位置** —— 按值找到位置本身还是 O(n)。所谓 O(1) 指的是指针重排那一下。`,
    },
    {
      id: 'variants',
      title: '变体与工程应用',
      body: `**常见变体**:

- **双向链表**:节点同时持 prev/next 指针,可反向走,删除已知节点无需先找前驱;
- **循环链表**:尾节点指回头部 —— 约瑟夫环、轮询调度;
- **哨兵节点**:头部加一个哑节点,删除头元素不再特判。

**工程应用**:

- **LRU 缓存** = 哈希表 + 双向链表(哈希表 O(1) 定位,链表 O(1) 挪到队头/淘汰队尾);
- Linux 内核的进程链表、JS 事件循环的宏任务队列底层;
- 撤销/重做(Undo/Redo)= 两个栈或一条链表上的游标移动。`,
    },
  ],
}

export default tutorial
