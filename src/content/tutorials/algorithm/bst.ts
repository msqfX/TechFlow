import type { TutorialContent } from '@/types/content'

const tutorial: TutorialContent = {
  meta: {
    id: 'tutorial-bst',
    slug: 'bst',
    title: '二叉搜索树(BST)',
    description:
      '逐帧操作二叉搜索树:插入走比较路径、中序遍历得到有序序列、查询 O(log n) —— 以及退化成链表时 O(n) 的教训,理解平衡树存在的理由。',
    category: 'algorithm',
    difficulty: 'intermediate',
    duration: 15,
    tags: ['BST', '二叉树', '中序遍历', '退化', '平衡树'],
    prerequisites: ['linked-list', 'btree-index'],
    relatedTutorials: ['btree-index', 'stack-queue', 'bubble-sort'],
    sceneType: 'bst',
    featured: false,
    order: 22,
  },
  objectives: [
    '掌握 BST 的不变式:左子树 < 根 < 右子树(对每个节点成立)',
    '掌握插入/查询/删除都沿「比较路径」下降,平均 O(log n)',
    '理解中序遍历 = 有序序列(左 → 根 → 右)',
    '亲眼看到递增插入导致退化成链表 O(n),理解平衡树(AVL/红黑树)存在的理由',
  ],
  chapters: [
    {
      id: 'invariant',
      title: 'BST 不变式:左 < 根 < 右',
      body: `二叉搜索树(Binary Search Tree)只有一条规则,但对**每个节点**都成立:

**左子树的所有键 < 本节点键 < 右子树的所有键**

这条不变式带来三个直接推论:

- **查询**像二分:与当前节点比较,小往左、大往右,每步淘汰一半 → 平均 O(log n);
- **插入**就是一次 unsuccessful 的查询,走到空位挂上 → O(log n);
- **中序遍历**(左 → 根 → 右 递归)恰好得到**升序序列** —— 不变式的直接数学结果。`,
    },
    {
      id: 'delete',
      title: '删除的三种情况',
      body: `删除是 BST 里最有技巧的操作,按目标节点的孩子数分三种:

1. **叶子**:直接摘除,null 接回父节点;
2. **只有一个孩子**:孩子顶替自己的位置;
3. **有两个孩子**:找**右子树的最小节点**(或左子树最大)作为继任者 —— 换值后转化为情况 1/2 删除继任者。选右子树最小保证替换后不变式依然成立。

实现细节多、边界多,是面试与 bug 的高产区 —— 工程上更常用红黑树这类自平衡结构(标准库 TreeMap/TreeSet)。`,
    },
    {
      id: 'degenerate',
      title: '退化:BST 的阿喀琉斯之踵',
      body: `BST 的 O(log n) 依赖「树是平衡的」这个假设 —— 而普通 BST **没有任何机制维持它**。

按 **1, 2, 3, 4, 5 … 递增插入**:每个节点都只有右孩子,树退化成**链表**,高度 = n,查询/插入全部变成 **O(n)** —— 和挨个扫描没区别。

这就是平衡树家族存在的理由:

- **AVL / 红黑树**:旋转保持平衡,内存中的有序结构(TreeMap、epoll 红黑树);
- **B/B+Tree**:矮胖多叉,为磁盘页设计(数据库索引,见本站 B+Tree 教程)。

本教程的挑战模式可以亲手用递增序列把 BST 插成链表,对照《B+Tree》同一实验 —— 后者依然平衡。`,
    },
    {
      id: 'usage',
      title: '工程应用与取舍',
      body: `BST(及其平衡变体)适合需要**维护有序集**的场景:

- **TreeMap/TreeSet**(红黑树):范围查询、按序遍历、取前驱后继 —— 哈希表做不了这些;
- **epoll 的红黑树**:文件描述符按 fd 有序管理;
- **数据库内存索引、计时器轮**(按到期时间有序)。

与哈希表对比:哈希表**等值查询 O(1)** 但无序;BST **有序 + 范围查询 O(log n)** 但查询稍慢。两者互补而非替代。`,
    },
  ],
}

export default tutorial
