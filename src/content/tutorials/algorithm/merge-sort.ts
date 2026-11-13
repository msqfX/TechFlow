import type { TutorialContent } from '@/types/content'

const tutorial: TutorialContent = {
  meta: {
    id: 'tutorial-merge-sort',
    slug: 'merge-sort',
    title: '归并排序',
    description:
      '逐帧观察归并排序的自底向上合并:游程翻倍、双指针取小、写回辅助数组,对照快速排序理解稳定排序与 O(n log n) 保证的代价。',
    category: 'algorithm',
    difficulty: 'intermediate',
    duration: 16,
    tags: ['排序', '归并', '分治', '稳定排序', '双指针'],
    prerequisites: ['quick-sort'],
    relatedTutorials: ['quick-sort', 'bubble-sort', 'stack-queue'],
    sceneType: 'merge-sort',
    featured: false,
    order: 21,
  },
  objectives: [
    '掌握归并的分治结构:不断二分到单元素,再两两合并有序游程',
    '逐步走完 merge 双指针:比较两游程头部取小者,写入辅助数组',
    '理解归并是稳定排序(相等取左)且有 O(n log n) 保证(无最坏退化)',
    '理解代价:O(n) 辅助数组,以及它与快排「原地」的工程取舍',
  ],
  chapters: [
    {
      id: 'divide-merge',
      title: '与快排相反的分治',
      body: `归并排序同样分治,但次序与快排**相反**:

- **快排**:先干活(分区,基准归位)再递归 —— 主要工作在「下」;
- **归并**:先递归(把左右两半各自排好)再干活(合并两个有序数组)—— 主要工作在「上」。

本教程用**自底向上**的迭代写法教学:把每个元素当成长度 1 的有序游程,先两两合并成长度 2 的游程,再合并成 4、8…… 直到覆盖全数组。游程宽度 1→2→4 翻倍,共 **log n 轮**,每轮合并扫描总计 O(n) → **O(n log n)**。`,
    },
    {
      id: 'merge',
      title: 'merge:双指针取小者',
      body: `合并两个**各自有序**的数组是归并的核心动作,双指针一次线性扫描完成:

- 指针 i 指左游程、j 指右游程;
- 比较 \`a[i]\` 与 \`a[j]\`,**取小者写入辅助数组**,对应指针右移;
- 一边耗尽后,把另一边剩余整体接上。

关键细节:**相等时取左游程的元素** —— 这让左半区(原始位置靠前)的元素保持在前面,归并因此是**稳定排序**。快排做不到这一点。`,
    },
    {
      id: 'tradeoff',
      title: '稳定 + 无最坏退化,代价是 O(n) 辅助数组',
      body: `归并 vs 快排的完整对照:

| 维度 | 归并 | 快排 |
|---|---|---|
| 最坏复杂度 | **O(n log n) 有保证** | O(n²)(分区失衡) |
| 稳定性 | **稳定** | 不稳定 |
| 空间 | O(n) 辅助数组 | O(log n) 递归栈,原地 |
| 缓存友好 | 一般(来回拷贝) | 好(原地顺序扫描) |

工程映射:要求稳定或要求**最坏情况可控**(如延迟敏感、外部排序)选归并系 —— Java 对象排序(TimSort)、数据库外排;追求平均速度与低内存选快排系。**,两者没有绝对赢家,只有场景匹配**。`,
    },
  ],
}

export default tutorial
