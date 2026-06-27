import { Parser } from 'htmlparser2';
import { SSRFiber } from './type';

/**
 * 使用 htmlparser2 将 HTML 字符串解析为 SSRFiber，插入到 root 下。
 * 解析产生的节点通过 child/next/parent 组成树结构，挂载到 root.child 链表。
 */
export function parseHtmlToFibers(html: string, root: SSRFiber): void {
  // 栈：跟踪当前父节点及其最后一个子节点。root 始终在栈底
  const stack: { parent: SSRFiber; lastChild: SSRFiber | null }[] = [
    { parent: root, lastChild: null },
  ];
  // 当前层级的上一个兄弟节点
  let prevSibling: SSRFiber | null = null;

  const append = (node: SSRFiber) => {
    const frame = stack[stack.length - 1];
    if (!frame.parent.child) {
      frame.parent.child = node;
    } else if (frame.lastChild) {
      frame.lastChild.next = node;
    }
    frame.lastChild = node;
    node.parent = frame.parent;
    prevSibling = node;
  };

  // 通过 onparserinit 拿到 parser 实例，后续从 parser.endIndex 读取 > 的位置
  let parserRef: Parser;

  const parser = new Parser({
    onparserinit(p: Parser) {
      parserRef = p;
    },

    onopentag(name: string, attribs: Record<string, string>) {
      const fiber = new SSRFiber(name, { ...attribs });
      // onopentagend 在 onopentag 之前触发，已将 endIndex 写入 parser
      fiber.openTagEnd = parserRef.endIndex;
      append(fiber);
      stack.push({ parent: fiber, lastChild: null });
      prevSibling = null;
    },

    ontext(text: string) {
      const fiber = new SSRFiber('text', { children: text });
      append(fiber);
    },

    onclosetag() {
      stack.pop();
      const top = stack[stack.length - 1];
      prevSibling = top.lastChild ?? null;
    },
  });

  parser.write(html);
  parser.end();
}
