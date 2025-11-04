# POS SHOPPING - Modern Point of Sale System

A professional, full-featured point of sale system built with React, TypeScript, and Supabase.

## Features

- **Product Management**: Add, edit, and organize products with categories
- **Inventory Tracking**: Real-time stock monitoring with low stock alerts
- **Sales Processing**: Fast checkout with multiple payment methods
- **Customer Management**: Track customer information and purchase history
- **Sales Reports**: Comprehensive analytics and Excel export capabilities
- **Cart Management**: Hold carts for later and process returns
- **Responsive Design**: Works on desktop, tablet, and mobile devices

## Technologies Used

- **Frontend**: React 18, TypeScript, Vite
- **UI Framework**: Tailwind CSS, shadcn-ui
- **Backend**: Supabase (PostgreSQL database, Authentication, RLS)
- **State Management**: React Query
- **Routing**: React Router v6

## Getting Started

### Prerequisites

- Node.js 16+ and npm installed
- Git

### Installation

```bash
# Clone the repository
git clone <YOUR_GIT_URL>

# Navigate to project directory
cd <YOUR_PROJECT_NAME>

# Install dependencies
npm install

# Start development server
npm run dev
```

The app will be available at `http://localhost:8080`

### Building for Production

```bash
# Create production build
npm run build

# Preview production build
npm run preview
```

## Project Structure

```
src/
├── components/          # Reusable UI components
│   ├── ui/             # shadcn-ui components
│   ├── Cart.tsx        # Shopping cart component
│   ├── ProductGrid.tsx # Product display grid
│   └── ...
├── pages/              # Page components
│   ├── POS.tsx         # Main POS interface
│   ├── Products.tsx    # Product management
│   ├── Reports.tsx     # Sales analytics
│   └── ...
├── integrations/       # Supabase integration
└── hooks/              # Custom React hooks
```

## Deployment

This project can be deployed to any static hosting service:

- **Vercel**: Connect your Git repo for automatic deployments
- **Netlify**: Deploy with continuous integration
- **Custom Server**: Build and serve the `dist` folder

## Security

- Row Level Security (RLS) enabled on all database tables
- User authentication required for all operations
- Secure session management with Supabase Auth

## License

MIT License - feel free to use this project for commercial or personal use.

## Support

For issues and questions, please open an issue in the repository.
