<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#0f7a91" media="(prefers-color-scheme: light)">
    <meta name="theme-color" content="#0c141b" media="(prefers-color-scheme: dark)">
    <title>Pressing Manager</title>
    <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='9' fill='%230f7a91'/%3E%3Cpath d='M16 11a2.5 2.5 0 1 1 2.5 2.5c-1 0-2.5.6-2.5 2v.6l8.6 5.2c1 .6.6 2.2-.6 2.2H8c-1.2 0-1.6-1.6-.6-2.2L16 16.1' fill='none' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@600;700;800&display=swap" rel="stylesheet">
    @viteReactRefresh
    @vite(['resources/css/app.css', 'resources/js/main.tsx'])
    <script>
        // Applique le thème avant le rendu pour éviter un flash clair/sombre.
        try {
            var theme = localStorage.getItem('pm.theme');
            if (theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                document.documentElement.classList.add('dark');
            }
        } catch (e) {}
    </script>
</head>
<body>
    <div id="root"></div>
</body>
</html>
