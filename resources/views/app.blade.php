<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="theme-color" content="#4338ca">
    <title>Pressing Manager</title>
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
