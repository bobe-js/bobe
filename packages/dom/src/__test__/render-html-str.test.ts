import { bobe, Store } from 'bobe';
import { renderHtmlStr } from '#/render-html-str';

function renderHtml<T extends typeof Store>(Ctor: T) {
  const { html } = renderHtmlStr(Ctor as any);
  return html;
}

describe('renderHtmlStr — basic elements', () => {
  it('should render a simple div with text', () => {
    class App extends Store {
      ui = bobe`div text="hello world"`;
    }
    expect(renderHtml(App)).toBe('<div>hello world</div>');
  });

  it('should render nested elements', () => {
    class App extends Store {
      ui = bobe`
        div
          h1 text="Title"
          p text="Paragraph"
      `;
    }
    expect(renderHtml(App)).toBe('<div><h1>Title</h1><p>Paragraph</p></div>');
  });

  it('should render multiple siblings', () => {
    class App extends Store {
      ui = bobe`
        span text="a"
        span text="b"
        span text="c"
      `;
    }
    expect(renderHtml(App)).toBe('<span>a</span><span>b</span><span>c</span>');
  });
});

describe('renderHtmlStr — attributes', () => {
  it('should set id and class', () => {
    class App extends Store {
      ui = bobe`div id="myId" class="my-class" text="hello"`;
    }
    expect(renderHtml(App)).toBe('<div id="myId" class="my-class">hello</div>');
  });

  it('should set data-* attributes', () => {
    class App extends Store {
      ui = bobe`div data-id="123" text="hi"`;
    }
    expect(renderHtml(App)).toBe('<div data-id="123">hi</div>');
  });

  it('should set custom attributes', () => {
    class App extends Store {
      ui = bobe`div title="tooltip" text="hi"`;
    }
    expect(renderHtml(App)).toBe('<div title="tooltip">hi</div>');
  });

  it('should omit attribute when value is null', () => {
    class App extends Store {
      ui = bobe`div title={null} text="hi"`;
    }
    expect(renderHtml(App)).toBe('<div>hi</div>');
  });

  it('should omit data-* attribute when value is null', () => {
    class App extends Store {
      val: any = null;
      ui = bobe`div data-x={val} text="hi"`;
    }
    expect(renderHtml(App)).toBe('<div>hi</div>');
  });

  it('should render class from object', () => {
    class App extends Store {
      cls = { active: true, hidden: false };
      ui = bobe`div class={cls} text="hi"`;
    }
    expect(renderHtml(App)).toBe('<div class="active">hi</div>');
  });

  it('should render class from string', () => {
    class App extends Store {
      cls = 'btn primary';
      ui = bobe`div class={cls} text="hi"`;
    }
    expect(renderHtml(App)).toBe('<div class="btn primary">hi</div>');
  });

  it('should render style attribute', () => {
    class App extends Store {
      ui = bobe`div style="color: red" text="hi"`;
    }
    expect(renderHtml(App)).toBe('<div style="color: red">hi</div>');
  });
});

describe('renderHtmlStr — text and html', () => {
  it('should render text attribute as textContent', () => {
    class App extends Store {
      ui = bobe`p text="Hello & welcome"`;
    }
    expect(renderHtml(App)).toBe('<p>Hello &amp; welcome</p>');
  });

  it('should render html attribute as raw innerHTML', () => {
    class App extends Store {
      ui = bobe`div html="<b>bold</b>"`;
    }
    expect(renderHtml(App)).toBe('<div><b>bold</b></div>');
  });

  it('should prefer html over text when both set', () => {
    class App extends Store {
      ui = bobe`div html="<b>bold</b>" text="plain"`;
    }
    expect(renderHtml(App)).toBe('<div><b>bold</b></div>');
  });

  it('should warn when text content and child elements conflict', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    class App extends Store {
      ui = bobe`
        div text="parent text"
          span text="child"
      `;
    }
    expect(renderHtml(App)).toBe('<div>parent text</div>');
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('should warn when html content and child elements conflict', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    class App extends Store {
      ui = bobe`
        div html="<b>bold</b>"
          span text="child"
      `;
    }
    expect(renderHtml(App)).toBe('<div><b>bold</b></div>');
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe('renderHtmlStr — boolean attributes', () => {
  it('should output boolean attr in minimal form when true', () => {
    class App extends Store {
      ui = bobe`input disabled=true`;
    }
    expect(renderHtml(App)).toBe('<input disabled />');
  });

  it('should omit boolean attr when false', () => {
    class App extends Store {
      ui = bobe`input disabled=false`;
    }
    expect(renderHtml(App)).toBe('<input />');
  });

  it('should output multiple boolean attrs', () => {
    class App extends Store {
      ui = bobe`input disabled=true readonly=true`;
    }
    expect(renderHtml(App)).toBe('<input disabled readonly />');
  });
});

describe('renderHtmlStr — void elements', () => {
  it('should self-close br', () => {
    class App extends Store {
      ui = bobe`br`;
    }
    expect(renderHtml(App)).toBe('<br />');
  });

  it('should self-close img with attributes', () => {
    class App extends Store {
      ui = bobe`img src="a.png" alt="pic"`;
    }
    expect(renderHtml(App)).toBe('<img src="a.png" alt="pic" />');
  });

  it('should self-close input', () => {
    class App extends Store {
      ui = bobe`input type="text" placeholder="Search"`;
    }
    expect(renderHtml(App)).toBe('<input type="text" placeholder="Search" />');
  });

  it('should self-close hr and meta', () => {
    class App extends Store {
      ui = bobe`
        div
          hr
          meta charset="UTF-8"
      `;
    }
    expect(renderHtml(App)).toBe('<div><hr /><meta charset="UTF-8" /></div>');
  });

  it('should render normal void elements (<br />) inside containers', () => {
    class App extends Store {
      ui = bobe`
        div
          br
          span text="after"
      `;
    }
    expect(renderHtml(App)).toBe('<div><br /><span>after</span></div>');
  });
});

describe('renderHtmlStr — events', () => {
  it('should NOT render onclick in HTML', () => {
    class App extends Store {
      handler = () => {};
      ui = bobe`button onclick={handler} text="click"`;
    }
    expect(renderHtml(App)).toBe('<button>click</button>');
  });

  it('should NOT render oninput in HTML', () => {
    class App extends Store {
      handler = () => {};
      ui = bobe`input oninput={handler}`;
    }
    expect(renderHtml(App)).toBe('<input />');
  });

  it('should NOT render ref attribute in HTML', () => {
    class App extends Store {
      divRef = null;
      ui = bobe`div ref={divRef} text="hello"`;
    }
    expect(renderHtml(App)).toBe('<div>hello</div>');
  });
});

describe('renderHtmlStr — conditional rendering', () => {
  it('should render if branch when condition is true', () => {
    class App extends Store {
      show = true;
      ui = bobe`
        div
          if show
            span text="visible"
      `;
    }
    expect(renderHtml(App)).toBe('<div><span>visible</span><!--if-after--></div>');
  });

  it('should skip if branch when condition is false', () => {
    class App extends Store {
      show = false;
      ui = bobe`
        div
          if show
            span text="hidden"
      `;
    }
    expect(renderHtml(App)).toBe('<div><!--if-after--></div>');
  });

  it('should render if/else branches', () => {
    class App extends Store {
      flag = true;
      ui = bobe`
        div
          if flag
            span text="yes"
          else
            span text="no"
      `;
    }
    expect(renderHtml(App)).toBe('<div><span>yes</span><!--if-after--><!--else-after--></div>');
  });

  it('should handle if/else with false condition', () => {
    class App extends Store {
      flag = false;
      ui = bobe`
        div
          if flag
            span text="yes"
          else
            span text="no"
      `;
    }
    expect(renderHtml(App)).toBe('<div><!--if-after--><span>no</span><!--else-after--></div>');
  });

  it('should handle nested conditions', () => {
    class App extends Store {
      outer = true;
      inner = true;
      ui = bobe`
        div
          if outer
            h1 text="outer"
            if inner
              h2 text="inner"
      `;
    }
    expect(renderHtml(App)).toBe('<div><h1>outer</h1><h2>inner</h2><!--if-after--><!--if-after--></div>');
  });

  it('should place anchor after children in document order', () => {
    class App extends Store {
      show = true;
      ui = bobe`
        div
          if show
            span text="first"
          span text="last"
      `;
    }
    expect(renderHtml(App)).toBe('<div><span>first</span><!--if-after--><span>last</span></div>');
  });
});

describe('renderHtmlStr — for loop', () => {
  it('should render array items', () => {
    class App extends Store {
      items = ['a', 'b', 'c'];
      ui = bobe`
        ul
          for items; item i
            li text={item}
      `;
    }
    expect(renderHtml(App)).toBe(
      '<ul><!--for-item-before--><!--for-item-before--><!--for-item-before--><li>a</li><!--for-item-after--><li>b</li><!--for-item-after--><li>c</li><!--for-item-after--><!--for-after--></ul>'
    );
  });

  it('should handle empty array', () => {
    class App extends Store {
      items: string[] = [];
      ui = bobe`
        ul
          for items; item i
            li text={item}
      `;
    }
    expect(renderHtml(App)).toBe('<ul><!--for-after--></ul>');
  });

  it('should include for-item anchors', () => {
    class App extends Store {
      items = ['x'];
      ui = bobe`
        ul
          for items; item i
            li text={item}
      `;
    }
    expect(renderHtml(App)).toBe('<ul><!--for-item-before--><li>x</li><!--for-item-after--><!--for-after--></ul>');
  });

  it('should place anchors in correct document order for for loop', () => {
    class App extends Store {
      items = ['x'];
      ui = bobe`
        ul
          for items; item i
            li text={item}
          span text="after"
      `;
    }
    expect(renderHtml(App)).toBe(
      '<ul><!--for-item-before--><li>x</li><!--for-item-after--><!--for-after--><span>after</span></ul>'
    );
  });
});

describe('renderHtmlStr — component rendering', () => {
  it('should render child component via static interpolation', () => {
    class Child extends Store {
      ui = bobe`span text="child"`;
    }
    class Parent extends Store {
      ui = bobe`
        div
          ${Child}
      `;
    }
    expect(renderHtml(Parent)).toBe('<div><span>child</span><!--component-after--></div>');
  });

  it('should render nested components', () => {
    class Leaf extends Store {
      ui = bobe`em text="leaf"`;
    }
    class Child extends Store {
      ui = bobe`
        p
          ${Leaf}
      `;
    }
    class Parent extends Store {
      ui = bobe`
        div
          ${Child}
      `;
    }
    expect(renderHtml(Parent)).toBe(
      '<div><p><em>leaf</em><!--component-after--></p><!--component-after--></div>'
    );
  });
});

describe('renderHtmlStr — reactive initial values', () => {
  it('should render initial reactive text value', () => {
    class App extends Store {
      name = 'Alice';
      ui = bobe`span text={name}`;
    }
    expect(renderHtml(App)).toBe('<span>Alice</span>');
  });

  it('should render initial reactive attribute value', () => {
    class App extends Store {
      cls = 'btn-primary';
      ui = bobe`button class={cls} text="Submit"`;
    }
    expect(renderHtml(App)).toBe('<button class="btn-primary">Submit</button>');
  });
});

describe('renderHtmlStr — HTML escaping', () => {
  it('should escape text content with HTML characters', () => {
    class App extends Store {
      text = '<script>alert("xss")</script>';
      ui = bobe`div text={text}`;
    }
    expect(renderHtml(App)).toBe('<div>&lt;script&gt;alert("xss")&lt;/script&gt;</div>');
  });

  it('should escape attribute values with double quotes', () => {
    class App extends Store {
      val = 'foo"bar';
      ui = bobe`div title={val}`;
    }
    expect(renderHtml(App)).toBe('<div title="foo&quot;bar"></div>');
  });

  it('should escape ampersands in text', () => {
    class App extends Store {
      val = 'A & B';
      ui = bobe`div text={val}`;
    }
    expect(renderHtml(App)).toBe('<div>A &amp; B</div>');
  });

  it('should not escape html attribute values', () => {
    class App extends Store {
      raw = '<b>bold</b>';
      ui = bobe`div html={raw}`;
    }
    expect(renderHtml(App)).toBe('<div><b>bold</b></div>');
  });
});

describe('renderHtmlStr — text node (dynamic text without tag)', () => {
  it('should render raw text node', () => {
    class App extends Store {
      msg = 'Hello';
      ui = bobe`
        div
          {msg}
      `;
    }
    expect(renderHtml(App)).toBe('<div>Hello<!--dynamic-after--></div>');
  });

  it('should render text node with dynamic value', () => {
    class App extends Store {
      count = 42;
      ui = bobe`
        span
          {count}
      `;
    }
    expect(renderHtml(App)).toBe('<span>42<!--dynamic-after--></span>');
  });
});

describe('renderHtmlStr — inline fragment (children prop)', () => {
  it('should render inline fragment passed as children', () => {
    class App extends Store {
      fragment = bobe`
        span text="inline"
      `;
      ui = bobe`
        div
          {fragment}
      `;
    }
    expect(renderHtml(App)).toBe('<div><span>inline</span><!--dynamic-after--></div>');
  });
});

describe('renderHtmlStr — context node', () => {
  it('should render context provider with children', () => {
    class Child extends Store {
      ui = bobe`span text="child"`;
    }
    class App extends Store {
      ui = bobe`
        div
          context
            ${Child}
      `;
    }
    expect(renderHtml(App)).toBe(
      '<div><span>child</span><!--component-after--><!--context-after--></div>'
    );
  });
});

describe('renderHtmlStr — fail keyword', () => {
  it('should render fail as catch-all when preceding conditions are false', () => {
    class App extends Store {
      show = false;
      ui = bobe`
        div
          if show
            span text="yes"
          fail
            span text="no"
      `;
    }
    expect(renderHtml(App)).toBe('<div><!--if-after--><span>no</span><!--fail-after--></div>');
  });
});
