import { defineConfig } from 'vite'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

export default defineConfig({
  plugins: [
    {
      name: 'save-article-plugin',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
            if (req.method === 'GET' && req.url === '/api/articles') {
              try {
                const articlesDir = resolve(__dirname, 'src/articles');
                const files = fs.readdirSync(articlesDir);
                const articlesList = files
                  .filter(file => file.endsWith('.md'))
                  .map(file => {
                    const filePath = resolve(articlesDir, file);
                    const content = fs.readFileSync(filePath, 'utf-8');
                    return {
                      filename: file,
                      content: content
                    };
                  });
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify(articlesList));
              } catch (err) {
                res.statusCode = 500;
                res.end(JSON.stringify({ error: err.message }));
              }
            } else if (req.method === 'POST' && req.url === '/api/save') {
              let body = '';
              req.on('data', chunk => {
                body += chunk;
              });
              req.on('end', () => {
                try {
                  const { filename, content } = JSON.parse(body);
                  if (!filename || !content) {
                    res.statusCode = 400;
                    res.end(JSON.stringify({ error: 'Missing filename or content' }));
                    return;
                  }
                  
                  // Sanitize filename to prevent directory traversal
                  const safeFilename = filename.replace(/[^a-zA-Z0-9.\-_ ]/g, '');
                  const filePath = resolve(__dirname, 'src/articles', safeFilename);
                  
                  fs.writeFileSync(filePath, content, 'utf-8');
                  res.setHeader('Content-Type', 'application/json');
                  res.end(JSON.stringify({ success: true, message: `Guardado en ${safeFilename}` }));
                } catch (err) {
                  res.statusCode = 500;
                  res.end(JSON.stringify({ error: err.message }));
                }
              });
            } else {
              next();
            }
        });
      }
    }
  ],
  server: {
    watch: {
      ignored: ['**/src/articles/**']
    }
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        editor: resolve(__dirname, 'editor.html'),
      },
    },
  },
})
