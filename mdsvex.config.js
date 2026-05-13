import { createHighlighter } from 'shiki';
import { transformerNotationHighlight } from '@shikijs/transformers';
import lightTheme from './customCodeLight.json' with { type: 'json' };
import darkTheme from './customCodeDark.json' with { type: 'json' };

// Create shiki highlighter instance
const highlighter = await createHighlighter({
	themes: [lightTheme, darkTheme],
	langs: [
		'javascript',
		'typescript',
		'svelte',
		'html',
		'css',
		'json',
		'bash',
		'shell',
		'sh',
		'yaml',
		'markdown',
		'md',
		'toml',
		'python',
		'sql',
		'tsx',
		'jsx',
		'diff',
		'plaintext'
	]
});

// Parse meta string for title, showLineNumbers, and highlight lines
function parseMeta(meta) {
	const result = { title: null, showLineNumbers: false, highlightLines: new Set() };
	if (!meta) return result;

	// Match title="..." or title='...'
	const titleMatch = meta.match(/title=["']([^"']+)["']/);
	if (titleMatch) {
		result.title = titleMatch[1];
	}

	// Check for showLineNumbers
	if (meta.includes('showLineNumbers')) {
		result.showLineNumbers = true;
	}

	// Parse highlight lines {1, 3-5, 7}
	const highlightMatch = meta.match(/\{([^}]+)\}/);
	if (highlightMatch) {
		const ranges = highlightMatch[1].split(',').map((s) => s.trim());
		for (const range of ranges) {
			if (range.includes('-')) {
				const [start, end] = range.split('-').map(Number);
				for (let i = start; i <= end; i++) {
					result.highlightLines.add(i);
				}
			} else {
				result.highlightLines.add(Number(range));
			}
		}
	}

	return result;
}

// Escape characters for Svelte templates
function escapeForSvelte(html) {
	return html.replace(/[{}]/g, (c) => (c === '{' ? '&#123;' : '&#125;'));
}

// Convert [!code highlight:start] / [!code highlight:end] to [!code highlight:N]
function preprocessHighlightRanges(code) {
	const lines = code.split('\n');
	const result = [];
	let highlightStart = -1;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (line.includes('[!code highlight:start]')) {
			highlightStart = i;
			// Replace :start with the count (will be calculated when we find :end)
			result.push(line);
		} else if (line.includes('[!code highlight:end]')) {
			if (highlightStart !== -1) {
				const count = i - highlightStart + 1;
				// Update the start line with the count
				result[highlightStart] = result[highlightStart].replace(
					'[!code highlight:start]',
					`[!code highlight:${count}]`
				);
				// Remove the end marker from this line
				result.push(line.replace(/\s*(?:\/\/|\/\*|<!--)\s*\[!code highlight:end\]\s*(?:\*\/|-->)?/, ''));
				highlightStart = -1;
			} else {
				result.push(line);
			}
		} else {
			result.push(line);
		}
	}

	return result.join('\n');
}

/** @type {import('mdsvex').MdsvexOptions} */
const config = {
	extensions: ['.svx', '.mdx'],
	smartypants: {
		dashes: 'oldschool'
	},
	highlight: {
		highlighter: (code, lang, meta) => {
			const { title, showLineNumbers, highlightLines } = parseMeta(meta);
			const validLang = highlighter.getLoadedLanguages().includes(lang) ? lang : 'plaintext';

			// Pre-process highlight:start/end ranges
			const processedCode = preprocessHighlightRanges(code);

			const html = highlighter.codeToHtml(processedCode, {
				lang: validLang,
				themes: {
					light: 'grayscale-light',
					dark: 'grayscale-dark'
				},
				defaultColor: false,
				transformers: [
					transformerNotationHighlight({
						classActiveLine: 'highlighted'
					})
				]
			});

			// Escape curly braces for Svelte
			let escaped = escapeForSvelte(html);

			// Remove tabindex from pre element (a11y warning)
			escaped = escaped.replace(/ tabindex="0"/g, '');

			// Add data-line attribute to all lines, and highlighted class for specified lines
			let lineNum = 0;
			escaped = escaped.replace(/<span class="line( highlighted)?">/g, (match, hasHighlight) => {
				lineNum++;
				const isHighlighted = hasHighlight || highlightLines.has(lineNum);
				if (isHighlighted) {
					return '<span class="line highlighted" data-line>';
				}
				return '<span class="line" data-line>';
			});

			// Add data-line-numbers attribute to code element if showLineNumbers is set
			if (showLineNumbers) {
				escaped = escaped.replace(/<code>/, '<code data-line-numbers>');
			}

			// Always wrap in figure for consistent styling, add title if present
			if (title) {
				escaped = `<figure data-rehype-pretty-code-figure><figcaption data-rehype-pretty-code-title>${title}</figcaption>${escaped}</figure>`;
			} else {
				escaped = `<figure data-rehype-pretty-code-figure>${escaped}</figure>`;
			}

			return escaped;
		}
	}
};

export default config;
