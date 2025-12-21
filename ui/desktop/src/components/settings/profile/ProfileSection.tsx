import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../ui/card';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import { Label } from '../../ui/label';
import { Textarea } from '../../ui/textarea';
import { User, Upload, Image as ImageIcon, ChevronRight } from 'lucide-react';

interface ProfileSectionProps {
  compactMode?: boolean;
}

export default function ProfileSection({ compactMode = false }: ProfileSectionProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [bio, setBio] = useState('');
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  if (compactMode) {
    return (
      <div className="space-y-8">
        <div>
          <h2 className="text-xl font-medium mb-1">Profile</h2>
          <p className="text-sm text-text-muted">
            Tell the agent about yourself. This information helps the agent understand your preferences and context.
          </p>
        </div>

        {/* Compact List Style */}
        <div className="space-y-1">
          {/* Avatar */}
          <div className="flex items-center justify-between py-3 px-4 rounded-lg border border-border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full border border-border flex items-center justify-center overflow-hidden">
                {avatarPreview ? (
                  <img src={avatarPreview} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <User className="w-5 h-5 text-text-muted" />
                )}
              </div>
              <div>
                <div className="text-sm font-medium">Profile Picture</div>
                <div className="text-xs text-text-muted">Upload a profile picture</div>
              </div>
            </div>
            <label htmlFor="avatar-upload-compact" className="cursor-pointer rounded p-1 hover:bg-background-muted transition-colors">
              <Upload className="w-4 h-4 text-text-muted" />
              <input
                id="avatar-upload-compact"
                type="file"
                accept="image/*"
                onChange={handleAvatarUpload}
                className="hidden"
              />
            </label>
          </div>

          {/* Name */}
          <div className="py-3 px-4 rounded-lg border border-border">
            <div className="text-sm font-medium mb-1">Name</div>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="h-8 text-sm"
            />
          </div>

          {/* Email */}
          <div className="py-3 px-4 rounded-lg border border-border">
            <div className="text-sm font-medium mb-1">Email</div>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your.email@example.com"
              className="h-8 text-sm"
            />
          </div>

          {/* About */}
          <div className="py-3 px-4 rounded-lg border border-border">
            <div className="text-sm font-medium mb-2">About You</div>
            <Textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Tell the agent about yourself..."
              rows={4}
              className="text-sm resize-none"
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-light mb-2">Profile</h2>
        <p className="text-sm text-text-muted">
          Tell the agent about yourself. This information helps the agent understand your preferences and context.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          {/* Avatar */}
          <div className="flex items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="w-16 h-16 rounded-full border border-border flex items-center justify-center overflow-hidden">
                  {avatarPreview ? (
                    <img src={avatarPreview} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-8 h-8 text-text-muted" />
                  )}
                </div>
                <label
                  htmlFor="avatar-upload"
                  className="absolute bottom-0 right-0 w-7 h-7 bg-background-accent rounded-full flex items-center justify-center cursor-pointer hover:bg-background-accent/80 transition-colors"
                  title="Upload profile picture"
                >
                  <Upload className="w-3.5 h-3.5 text-text-on-accent" />
                  <input
                    id="avatar-upload"
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarUpload}
                    className="hidden"
                  />
                </label>
              </div>

              <div className="flex-1">
                <div className="text-sm font-medium">Profile Picture</div>
                <p className="text-xs text-text-muted mt-0.5">Upload a profile picture (JPG, PNG, max 5MB)</p>
              </div>
            </div>
          </div>

          <div className="h-px bg-border-default my-6" />

          {/* Name + Email */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-sm font-medium">
                Name
              </Label>
              <Input
                id="name"
                placeholder="Your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="your.email@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-9"
              />
            </div>
          </div>

          <div className="h-px bg-border-default my-6" />

          {/* About */}
          <div className="space-y-2">
            <Label htmlFor="bio" className="text-sm font-medium">
              About You
            </Label>
            <Textarea
              id="bio"
              placeholder="Tell the agent about yourself..."
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={6}
              className="resize-none text-sm"
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

