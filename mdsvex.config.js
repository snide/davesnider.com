import rehypePrettyCode from 'rehype-pretty-code';
import lightTheme from './customCodeLight.json' with { type: 'json' };
import darkTheme from './customCodeDark.json' with { type: 'json' };

/** @type {import('mdsvex').MdsvexOptions} */
const config = {
	extensions: ['.svx', '.mdx'],
	smartypants: {
		dashes: 'oldschool'
	},
	rehypePlugins: [
		[
			rehypePrettyCode,
			{
				keepBackground: false,
				theme: {
					dark: darkTheme,
					light: lightTheme
				}
			}
		]
	]
};

export default config;
