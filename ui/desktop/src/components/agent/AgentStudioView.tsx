import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Bot, FileText, Puzzle, ShoppingBag, Settings } from 'lucide-react';
import { MainPanelLayout } from '../Layout/MainPanelLayout';
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';

interface StudioCardProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  onClick: () => void;
}

const StudioCard: React.FC<StudioCardProps> = ({ icon: Icon, title, description, onClick }) => {
  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className="cursor-pointer"
      onClick={onClick}
    >
      <Card className="h-full hover:bg-background-medium transition-colors">
        <CardHeader>
          <div className="flex items-center gap-3 mb-2">
            <Icon className="w-6 h-6 text-text-prominent" />
            <CardTitle className="text-xl">{title}</CardTitle>
          </div>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
      </Card>
    </motion.div>
  );
};

export default function AgentStudioView() {
  const navigate = useNavigate();

  const cards = [
    {
      icon: Settings,
      title: 'Models & Providers',
      description: 'Configure AI models, providers, and default settings',
      path: '/settings?section=models',
    },
    {
      icon: FileText,
      title: 'Recipes',
      description: 'Create and manage reusable agent recipes',
      path: '/recipes',
    },
    {
      icon: Puzzle,
      title: 'Extensions',
      description: 'Install and manage agent extensions and tools',
      path: '/extensions',
    },
    {
      icon: ShoppingBag,
      title: 'Tools Marketplace',
      description: 'Browse and install tools from the marketplace',
      path: '/schedules',
    },
  ];

  return (
    <MainPanelLayout>
      <div className="flex flex-col h-full">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <Bot className="w-8 h-8 text-text-prominent" />
            <h1 className="text-3xl font-light">Agent Studio</h1>
          </div>
          <p className="text-text-muted text-lg">
            Configure your AI agent, manage recipes, extensions, and tools
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1">
          {cards.map((card, index) => (
            <motion.div
              key={card.path}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
            >
              <StudioCard
                icon={card.icon}
                title={card.title}
                description={card.description}
                onClick={() => navigate(card.path)}
              />
            </motion.div>
          ))}
        </div>
      </div>
    </MainPanelLayout>
  );
}


