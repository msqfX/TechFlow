import type { TutorialContent } from '@/types/content'

const tutorial: TutorialContent = {
  meta: {
    id: 'tutorial-red-black-tree',
    slug: 'red-black-tree',
    title: '红黑树',
    description:
      '逐帧观察红黑树的插入修复:变色与旋转(LL/RR/LR/RL 四种情况),理解五条性质如何保证黑高平衡 —— BST 退化问题的标准答案。',
    category: 'algorithm',
    difficulty: 'advanced',
    duration: 20,
    tags: ['红黑树', '旋转', '自平衡', 'BST 退化', 'TreeMap'],
    prerequisites: ['bst'],
    relatedTutorials: ['bst', 'btree-index', 'stack-queue'],
    sceneType: 'red-black-tree',
    featured: false,
    order: 24,
  },
  objectives: [
    '掌握红黑树五条性质,理解它们共同保证「最长路径 ≤ 2× 最短路径」',
    '掌握插入修复的四种情况:叔红变色 / 叔黑旋转(LL、RR、LR、RL)',
    '逐步追踪一次插入引发的变色与旋转序列',
    '理解红黑树 vs AVL 的取舍,以及工程落点(TreeMap、epoll、CFS)',
  ],
  chapters: [
    {
      id: 'properties',
      title: '五条性质:一条自平衡的契约',
      body: `红黑树 = 二叉搜索树 + 每个节点多存一个**颜色**(红/黑)+ 五条性质:

1. 每个节点非红即黑;
2. **根节点是黑色**;
3. **叶子(NIL 空节点)视为黑色**;
4. **红色节点的孩子必须是黑色**(红不相连);
5. **从任一节点到其所有叶子的路径包含相同数量的黑节点**(黑高一致)。

性质 4 + 5 联合保证:**最长路径(红黑交替)≤ 2 × 最短路径(全黑)** —— 树高被钉在 O(log n),BST 的退化在红黑树上不可能发生。`,
    },
    {
      id: 'insert',
      title: '插入与修复:四种情况',
      body: `新节点**总是红色**(插入黑色会破坏性质 5 的黑高,更难修)。若父节点是黑,完事;父节点是红则违反性质 4,按「叔叔节点」的颜色修复:

- **叔叔是红色 → 变色**:父与叔变黑、祖父变红,再把祖父当新节点向上检查;
- **叔叔是黑色 → 旋转**(四种几何形态):
  - **LL**(父是左孩子、新节点是左孩子):右旋祖父;
  - **RR**(镜像):左旋祖父;
  - **LR**(父是左、新节点是右):先左旋父再右旋祖父;
  - **RL**(镜像):先右旋父再左旋祖父。

旋转后子树根变黑、不再向上蔓延 —— 修复终止。`,
    },
    {
      id: 'rotation',
      title: '旋转:O(1) 的结构手术',
      body: `右旋(以 X 为轴):X 的左孩子 Y 上位,X 成为 Y 的右孩子,Y 原来的右子树挂到 X 的左下。左旋完全镜像。

旋转的精妙之处:**只改三个指针,局部有序性(搜索性质)完全保留** —— 这就是它能在 O(1) 内修复平衡的原因。对照 AVL:红黑树的旋转次数更少(插入最多 2 次),且变色操作廉价。

验证工具:本站场景在每一步都会校验五条性质(红红不相连、黑高一致),你可以亲眼看到每次变色/旋转后契约被重新满足。`,
    },
    {
      id: 'usage',
      title: '工程落点',
      body: `红黑树 vs AVL:AVL 更严格平衡(查询略快),但插入/删除旋转更多;红黑树旋转少、综合写入性能好 —— 成为绝大多数标准库的选择:

- **Java TreeMap / TreeSet**、**C++ std::map**(红黑树);
- **Linux epoll** 的就绪文件描述符管理、**CFS 进程调度器**(按 vruntime 有序);
- **HashMap 的冲突链**(Java 8:链长 ≥ 8 且表足够大时转红黑树,防哈希碰撞攻击退化)。

一句话:内存中需要「有序 + 查询/插入都稳」的地方,红黑树是默认答案;需要磁盘页友好的多叉版,见《B+Tree 索引》。`,
    },
  ],
}

export default tutorial
