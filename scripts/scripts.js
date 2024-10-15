import {
  buildBlock,
  loadHeader,
  loadFooter,
  decorateButtons,
  decorateIcons,
  decorateSections,
  decorateBlocks,
  decorateTemplateAndTheme,
  waitForFirstImage,
  loadSection,
  loadSections,
  loadCSS,
  sampleRUM,
} from './aem.js';

/**
 * create an element.
 * @param {string} tagName the tag for the element
 * @param {object} props properties to apply
 * @param {string|Element} html content to add
 * @returns the element
 */
export const createElement = (tagName, props, html) => {
  const elem = document.createElement(tagName);
  if (props) {
    Object.keys(props).forEach((propName) => {
      const val = props[propName];
      if (propName === 'class') {
        const classesArr = (typeof val === 'string') ? [val] : val;
        elem.classList.add(...classesArr);
      } else {
        elem.setAttribute(propName, val);
      }
    });
  }

  if (html) {
    const appendEl = (el) => {
      if (el instanceof HTMLElement || el instanceof SVGElement) {
        elem.append(el);
      } else {
        elem.insertAdjacentHTML('beforeend', el);
      }
    };

    if (Array.isArray(html)) {
      html.forEach(appendEl);
    } else {
      appendEl(html);
    }
  }

  return elem;
};

/**
 * Builds hero block and prepends to main in a new section.
 * @param {Element} main The container element
 */
function buildHeroBlock(main) {
  const h1 = main.querySelector('h1');
  const picture = main.querySelector('picture');
  // eslint-disable-next-line no-bitwise
  if (h1 && picture && (h1.compareDocumentPosition(picture) & Node.DOCUMENT_POSITION_PRECEDING)) {
    const section = document.createElement('div');
    section.append(buildBlock('hero', { elems: [picture, h1] }));
    main.prepend(section);
  }
}

function buildVideoBlock(main) {
  const link = main.querySelector('a');
  const isVideoLink = link.href.includes('.mp4');
  const section = link.closest('div');

  if (!isVideoLink) {
    return;
  }

  section.append(buildBlock('video', { elems: [link] }));
  section.classList.add('autoblocked-video');
  const images = section.querySelectorAll('picture');
  
  if (images) {
    const imageDivs = [];
    [...images].forEach((img) => {
      const wrapperDiv = createElement('div', {}, createElement('div', {}, img));
      imageDivs.push(wrapperDiv);
    });

    section.append(buildBlock('carousel', { elems: imageDivs }));
  }

  main.prepend(section);
}

/**
 * Wraps images followed by links within a matching <a> tag.
 * @param {Element} container The container element
 */
export const wrapImagesInLinks = (container) => {
  const ignorePatterns = ['/fragments/', '/forms/'];
  const pictures = container.querySelectorAll('picture');

  pictures.forEach((pic) => {
    // Case 1: <picture><br/><a>
    if (
      pic.nextElementSibling?.tagName === 'BR'
      && pic.nextElementSibling.nextElementSibling?.tagName === 'A'
    ) {
      const link = pic.nextElementSibling.nextElementSibling;
      if (link.textContent.includes(link.getAttribute('href'))) {
        if (ignorePatterns.some((pattern) => link.getAttribute('href').includes(pattern))) {
          return;
        }
        link.classList.remove('button');
        pic.nextElementSibling.remove();
        link.innerHTML = pic.outerHTML;
        pic.replaceWith(link);
      }
      return;
    }

    // Case 2: <p><picture></p><p><a></p>
    const parent = pic.parentElement;
    const nextSibling = parent.nextElementSibling;

    if (
      parent.tagName === 'P'
      && nextSibling?.tagName === 'P'
      && nextSibling.children.length === 1
    ) {
      const link = nextSibling.querySelector('a');
      if (link && link.textContent.includes(link.getAttribute('href'))) {
        if (ignorePatterns.some((pattern) => link.getAttribute('href').includes(pattern))) {
          return;
        }
        link.classList.remove('button');
        link.parentElement.remove();
        link.innerHTML = pic.outerHTML;
        pic.replaceWith(link);
      }
    }
  });
};

/**
 * load fonts.css and set a session storage flag
 */
async function loadFonts() {
  await loadCSS(`${window.hlx.codeBasePath}/styles/fonts.css`);
  try {
    if (!window.location.hostname.includes('localhost')) sessionStorage.setItem('fonts-loaded', 'true');
  } catch (e) {
    // do nothing
  }
}

/**
 * Builds all synthetic blocks in a container element.
 * @param {Element} main The container element
 */
function buildAutoBlocks(main) {
  try {
    buildHeroBlock(main);
    buildVideoBlock(main);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Auto Blocking failed', error);
  }
}

/**
 * Decorates the main element.
 * @param {Element} main The main element
 */
// eslint-disable-next-line import/prefer-default-export
export function decorateMain(main) {
  // hopefully forward compatible button decoration
  decorateButtons(main);
  decorateIcons(main);
  buildAutoBlocks(main);
  decorateSections(main);
  decorateBlocks(main);
}

/**
 * Loads everything needed to get to LCP.
 * @param {Element} doc The container element
 */
async function loadEager(doc) {
  document.documentElement.lang = 'en';
  decorateTemplateAndTheme();
  const main = doc.querySelector('main');
  if (main) {
    decorateMain(main);
    document.body.classList.add('appear');
    await loadSection(main.querySelector('.section'), waitForFirstImage);
  }

  sampleRUM.enhance();

  try {
    /* if desktop (proxy for fast connection) or fonts already loaded, load fonts.css */
    if (window.innerWidth >= 900 || sessionStorage.getItem('fonts-loaded')) {
      loadFonts();
    }
  } catch (e) {
    // do nothing
  }
}

/**
 * Loads everything that doesn't need to be delayed.
 * @param {Element} doc The container element
 */
async function loadLazy(doc) {
  const main = doc.querySelector('main');
  await loadSections(main);

  const { hash } = window.location;
  const element = hash ? doc.getElementById(hash.substring(1)) : false;
  if (hash && element) element.scrollIntoView();

  loadHeader(doc.querySelector('header'));
  loadFooter(doc.querySelector('footer'));

  loadCSS(`${window.hlx.codeBasePath}/styles/lazy-styles.css`);
  loadFonts();
}

/**
 * Loads everything that happens a lot later,
 * without impacting the user experience.
 */
function loadDelayed() {
  // eslint-disable-next-line import/no-cycle
  window.setTimeout(() => import('./delayed.js'), 3000);
  // load anything that can be postponed to the latest here
}

async function loadPage() {
  await loadEager(document);
  await loadLazy(document);
  loadDelayed();
}

loadPage();
