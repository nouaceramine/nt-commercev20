import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import apiClient from '../../lib/apiClient';
import { toast, Toaster } from 'sonner';
import {
  ShoppingCart, Search, X, Plus, Minus, Trash2,
  Phone, MapPin, Clock, Package, CheckCircle,
  ChevronLeft, Star, Truck, Shield, RefreshCw,
  Heart, Share2, Menu, ArrowRight
} from 'lucide-react';

// ─── CSS Styles (NOUACER-COD Theme) ───
const themeStyles = `
  @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;800;900&display=swap');

  .nouacer-store {
    font-family: 'Tajawal', -apple-system, BlinkMacSystemFont, sans-serif;
    direction: rtl;
    background: #f8f9fa;
    color: #2d3436;
    line-height: 1.6;
    min-height: 100vh;
  }

  /* CSS Variables */
  .nouacer-store {
    --nc-primary: #f7941d;
    --nc-primary-dark: #e8850f;
    --nc-secondary: #1a1a2e;
    --nc-accent: #ff6b6b;
    --nc-success: #27ae60;
    --nc-bg: #f8f9fa;
    --nc-card: #fff;
    --nc-text: #2d3436;
    --nc-text-light: #636e72;
    --nc-border: #e9ecef;
    --nc-shadow: 0 2px 12px rgba(0,0,0,0.06);
    --nc-shadow-hover: 0 8px 30px rgba(0,0,0,0.12);
    --nc-radius: 16px;
    --nc-radius-sm: 10px;
    --nc-transition: all 0.25s cubic-bezier(0.4,0,0.2,1);
  }

  /* Top Bar */
  .nc-top-bar {
    background: var(--nc-secondary);
    color: rgba(255,255,255,0.9);
    padding: 8px 0;
    font-size: 13px;
    font-weight: 500;
  }
  .nc-top-bar-inner {
    max-width: 1280px;
    margin: 0 auto;
    padding: 0 24px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
  }

  /* Header */
  .nc-header {
    background: rgba(255,255,255,0.95);
    padding: 16px 0;
    position: sticky;
    top: 0;
    z-index: 1000;
    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    backdrop-filter: blur(10px);
  }
  .nc-header-inner {
    max-width: 1280px;
    margin: 0 auto;
    padding: 0 24px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 24px;
  }
  .nc-logo {
    font-size: 28px;
    font-weight: 900;
    color: var(--nc-secondary);
    display: flex;
    align-items: center;
    gap: 10px;
    letter-spacing: -0.5px;
    text-decoration: none;
  }
  .nc-logo-icon {
    width: 42px;
    height: 42px;
    background: linear-gradient(135deg, var(--nc-primary), #ff9f43);
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-size: 20px;
    box-shadow: 0 4px 12px rgba(247,148,29,0.3);
  }
  .nc-logo span { color: var(--nc-primary); }

  /* Search */
  .nc-search-box {
    flex: 1;
    max-width: 480px;
    position: relative;
  }
  .nc-search-box input {
    width: 100%;
    padding: 12px 48px 12px 16px;
    border: 2px solid var(--nc-border);
    border-radius: 50px;
    font-size: 14px;
    background: var(--nc-bg);
    transition: var(--nc-transition);
    font-family: inherit;
  }
  .nc-search-box input:focus {
    border-color: var(--nc-primary);
    background: var(--nc-card);
    box-shadow: 0 0 0 4px rgba(247,148,29,0.1);
    outline: none;
  }
  .nc-search-btn {
    position: absolute;
    left: 6px;
    top: 50%;
    transform: translateY(-50%);
    background: var(--nc-primary);
    color: white;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    cursor: pointer;
    transition: var(--nc-transition);
  }
  .nc-search-btn:hover {
    background: var(--nc-primary-dark);
    transform: translateY(-50%) scale(1.05);
  }

  /* Cart */
  .nc-header-cart {
    position: relative;
    background: var(--nc-bg);
    padding: 10px 18px;
    border-radius: 50px;
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 600;
    font-size: 14px;
    color: var(--nc-secondary);
    transition: var(--nc-transition);
    cursor: pointer;
    border: none;
    font-family: inherit;
  }
  .nc-header-cart:hover {
    background: var(--nc-primary);
    color: white;
    box-shadow: 0 4px 12px rgba(247,148,29,0.3);
  }
  .nc-cart-count {
    background: var(--nc-accent);
    color: white;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 700;
  }

  /* Hero */
  .nc-hero {
    background: linear-gradient(135deg, var(--nc-secondary) 0%, #16213e 50%, #0f3460 100%);
    padding: 80px 0;
    position: relative;
    overflow: hidden;
  }
  .nc-hero::before {
    content: '';
    position: absolute;
    top: -30%;
    right: -10%;
    width: 500px;
    height: 500px;
    background: radial-gradient(circle, rgba(247,148,29,0.12) 0%, transparent 70%);
    border-radius: 50%;
  }
  .nc-hero-inner {
    max-width: 1280px;
    margin: 0 auto;
    padding: 0 24px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 60px;
    align-items: center;
    position: relative;
    z-index: 1;
  }
  .nc-hero-text h1 {
    font-size: 48px;
    font-weight: 900;
    color: white;
    line-height: 1.15;
    margin-bottom: 20px;
    letter-spacing: -1px;
  }
  .nc-hero-text h1 span {
    color: var(--nc-primary);
    display: block;
  }
  .nc-hero-text p {
    font-size: 18px;
    color: rgba(255,255,255,0.75);
    margin-bottom: 32px;
    line-height: 1.7;
  }
  .nc-hero-badges {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    margin-bottom: 32px;
  }
  .nc-hero-badge {
    background: rgba(255,255,255,0.1);
    backdrop-filter: blur(10px);
    padding: 8px 16px;
    border-radius: 50px;
    font-size: 13px;
    color: white;
    font-weight: 500;
    border: 1px solid rgba(255,255,255,0.1);
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .nc-hero-img {
    border-radius: 20px;
    box-shadow: 0 30px 60px rgba(0,0,0,0.3);
    max-width: 100%;
    height: auto;
  }

  /* Section Header */
  .nc-section {
    padding: 60px 0;
  }
  .nc-section-inner {
    max-width: 1280px;
    margin: 0 auto;
    padding: 0 24px;
  }
  .nc-section-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 32px;
  }
  .nc-section-title {
    font-size: 28px;
    font-weight: 800;
    color: var(--nc-secondary);
    position: relative;
    padding-right: 16px;
  }
  .nc-section-title::before {
    content: '';
    position: absolute;
    right: 0;
    top: 50%;
    transform: translateY(-50%);
    width: 4px;
    height: 28px;
    background: var(--nc-primary);
    border-radius: 2px;
  }

  /* Categories */
  .nc-categories-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 20px;
  }
  .nc-category-card {
    position: relative;
    border-radius: var(--nc-radius);
    overflow: hidden;
    height: 180px;
    cursor: pointer;
    transition: var(--nc-transition);
    box-shadow: var(--nc-shadow);
  }
  .nc-category-card:hover {
    transform: translateY(-4px);
    box-shadow: var(--nc-shadow-hover);
  }
  .nc-category-card img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform 0.6s;
  }
  .nc-category-card:hover img {
    transform: scale(1.1);
  }
  .nc-category-overlay {
    position: absolute;
    inset: 0;
    background: linear-gradient(to top, rgba(26,26,46,0.9) 0%, rgba(26,26,46,0.3) 50%, transparent 100%);
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    padding: 20px;
  }
  .nc-category-overlay h3 {
    color: white;
    font-size: 18px;
    font-weight: 700;
    margin-bottom: 4px;
  }
  .nc-category-overlay span {
    color: rgba(255,255,255,0.7);
    font-size: 13px;
  }
  .nc-category-icon {
    width: 60px;
    height: 60px;
    background: linear-gradient(135deg, var(--nc-primary), #ff9f43);
    border-radius: var(--nc-radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-size: 28px;
    margin-bottom: 12px;
  }

  /* Products */
  .nc-products-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: 24px;
  }
  .nc-product-card {
    background: var(--nc-card);
    border-radius: var(--nc-radius);
    overflow: hidden;
    box-shadow: var(--nc-shadow);
    transition: var(--nc-transition);
    border: 1px solid var(--nc-border);
    position: relative;
  }
  .nc-product-card:hover {
    transform: translateY(-6px);
    box-shadow: var(--nc-shadow-hover);
    border-color: transparent;
  }
  .nc-product-image {
    position: relative;
    height: 220px;
    background: var(--nc-bg);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }
  .nc-product-image img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform 0.5s;
  }
  .nc-product-card:hover .nc-product-image img {
    transform: scale(1.08);
  }
  .nc-product-placeholder {
    font-size: 64px;
    opacity: 0.3;
  }
  .nc-product-badge {
    position: absolute;
    top: 12px;
    right: 12px;
    background: var(--nc-accent);
    color: white;
    padding: 4px 12px;
    border-radius: 50px;
    font-size: 12px;
    font-weight: 700;
  }
  .nc-product-badge.low-stock {
    background: var(--nc-accent);
  }
  .nc-product-badge.out-of-stock {
    background: #95a5a6;
  }
  .nc-product-actions {
    position: absolute;
    bottom: -50px;
    left: 0;
    right: 0;
    display: flex;
    justify-content: center;
    gap: 8px;
    padding: 12px;
    transition: var(--nc-transition);
    background: linear-gradient(to top, rgba(0,0,0,0.5), transparent);
  }
  .nc-product-card:hover .nc-product-actions {
    bottom: 0;
  }
  .nc-action-btn {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: white;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    cursor: pointer;
    transition: var(--nc-transition);
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    color: var(--nc-secondary);
  }
  .nc-action-btn:hover {
    background: var(--nc-primary);
    color: white;
  }
  .nc-product-info {
    padding: 20px;
  }
  .nc-product-title {
    font-size: 15px;
    font-weight: 700;
    color: var(--nc-secondary);
    margin-bottom: 8px;
    line-height: 1.4;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .nc-product-price {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
  }
  .nc-price-current {
    font-size: 20px;
    font-weight: 800;
    color: var(--nc-primary);
  }
  .nc-price-old {
    font-size: 14px;
    color: var(--nc-text-light);
    text-decoration: line-through;
  }
  .nc-add-cart-btn {
    width: 100%;
    padding: 12px;
    background: var(--nc-primary);
    color: white;
    border: none;
    border-radius: var(--nc-radius-sm);
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    transition: var(--nc-transition);
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font-family: inherit;
  }
  .nc-add-cart-btn:hover {
    background: var(--nc-primary-dark);
    box-shadow: 0 4px 12px rgba(247,148,29,0.3);
  }
  .nc-add-cart-btn:disabled {
    background: #bdc3c7;
    cursor: not-allowed;
    box-shadow: none;
  }

  /* Features Bar */
  .nc-features {
    background: var(--nc-card);
    padding: 40px 0;
    border-top: 1px solid var(--nc-border);
    border-bottom: 1px solid var(--nc-border);
  }
  .nc-features-grid {
    max-width: 1280px;
    margin: 0 auto;
    padding: 0 24px;
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 32px;
  }
  .nc-feature-item {
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .nc-feature-icon {
    width: 52px;
    height: 52px;
    background: linear-gradient(135deg, var(--nc-primary), #ff9f43);
    border-radius: var(--nc-radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-size: 24px;
    flex-shrink: 0;
  }
  .nc-feature-text h4 {
    font-size: 15px;
    font-weight: 700;
    color: var(--nc-secondary);
    margin-bottom: 4px;
  }
  .nc-feature-text p {
    font-size: 13px;
    color: var(--nc-text-light);
  }

  /* Footer */
  .nc-footer {
    background: var(--nc-secondary);
    color: rgba(255,255,255,0.8);
    padding: 60px 0 0;
  }
  .nc-footer-inner {
    max-width: 1280px;
    margin: 0 auto;
    padding: 0 24px;
    display: grid;
    grid-template-columns: 2fr 1fr 1fr 1fr;
    gap: 40px;
  }
  .nc-footer-brand h3 {
    font-size: 24px;
    font-weight: 900;
    color: white;
    margin-bottom: 16px;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .nc-footer-brand p {
    font-size: 14px;
    line-height: 1.8;
    margin-bottom: 20px;
  }
  .nc-footer-contact {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .nc-footer-contact span {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 14px;
  }
  .nc-footer h4 {
    font-size: 16px;
    font-weight: 700;
    color: white;
    margin-bottom: 20px;
  }
  .nc-footer-links {
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .nc-footer-links a {
    color: rgba(255,255,255,0.7);
    font-size: 14px;
    transition: var(--nc-transition);
    text-decoration: none;
  }
  .nc-footer-links a:hover {
    color: var(--nc-primary);
  }
  .nc-footer-bottom {
    border-top: 1px solid rgba(255,255,255,0.1);
    margin-top: 40px;
    padding: 20px 24px;
    text-align: center;
    font-size: 13px;
    color: rgba(255,255,255,0.5);
  }

  /* Cart Sidebar */
  .nc-cart-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.5);
    z-index: 2000;
    opacity: 0;
    visibility: hidden;
    transition: var(--nc-transition);
  }
  .nc-cart-overlay.active {
    opacity: 1;
    visibility: visible;
  }
  .nc-cart-sidebar {
    position: fixed;
    top: 0;
    left: 0;
    width: 420px;
    max-width: 100%;
    height: 100vh;
    background: var(--nc-card);
    z-index: 2001;
    transform: translateX(-100%);
    transition: transform 0.3s ease;
    display: flex;
    flex-direction: column;
  }
  .nc-cart-sidebar.active {
    transform: translateX(0);
  }
  .nc-cart-header {
    padding: 20px 24px;
    border-bottom: 1px solid var(--nc-border);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .nc-cart-header h3 {
    font-size: 18px;
    font-weight: 800;
    color: var(--nc-secondary);
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .nc-cart-close {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: var(--nc-bg);
    border: none;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: var(--nc-text);
  }
  .nc-cart-items {
    flex: 1;
    overflow-y: auto;
    padding: 20px 24px;
  }
  .nc-cart-empty {
    text-align: center;
    padding: 60px 20px;
    color: var(--nc-text-light);
  }
  .nc-cart-empty-icon {
    font-size: 64px;
    margin-bottom: 16px;
    opacity: 0.3;
  }
  .nc-cart-item {
    display: flex;
    gap: 16px;
    padding: 16px 0;
    border-bottom: 1px solid var(--nc-border);
  }
  .nc-cart-item-img {
    width: 80px;
    height: 80px;
    background: var(--nc-bg);
    border-radius: var(--nc-radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    flex-shrink: 0;
  }
  .nc-cart-item-img img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .nc-cart-item-info {
    flex: 1;
  }
  .nc-cart-item-info h4 {
    font-size: 14px;
    font-weight: 700;
    color: var(--nc-secondary);
    margin-bottom: 4px;
  }
  .nc-cart-item-price {
    font-size: 15px;
    font-weight: 800;
    color: var(--nc-primary);
    margin-bottom: 8px;
  }
  .nc-cart-item-qty {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .nc-qty-btn {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--nc-bg);
    border: none;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: var(--nc-secondary);
    font-size: 16px;
  }
  .nc-qty-btn:hover {
    background: var(--nc-primary);
    color: white;
  }
  .nc-cart-item-remove {
    background: none;
    border: none;
    color: var(--nc-accent);
    cursor: pointer;
    padding: 4px;
  }
  .nc-cart-footer {
    padding: 20px 24px;
    border-top: 1px solid var(--nc-border);
    background: var(--nc-bg);
  }
  .nc-cart-total {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
    font-size: 18px;
    font-weight: 800;
    color: var(--nc-secondary);
  }
  .nc-cart-total span:last-child {
    color: var(--nc-primary);
    font-size: 22px;
  }
  .nc-cart-checkout-btn {
    width: 100%;
    padding: 14px;
    background: var(--nc-primary);
    color: white;
    border: none;
    border-radius: var(--nc-radius-sm);
    font-size: 16px;
    font-weight: 700;
    cursor: pointer;
    transition: var(--nc-transition);
    font-family: inherit;
  }
  .nc-cart-checkout-btn:hover {
    background: var(--nc-primary-dark);
  }

  /* Checkout Modal */
  .nc-modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.6);
    z-index: 3000;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    opacity: 0;
    visibility: hidden;
    transition: var(--nc-transition);
  }
  .nc-modal-overlay.active {
    opacity: 1;
    visibility: visible;
  }
  .nc-modal {
    background: var(--nc-card);
    border-radius: var(--nc-radius);
    width: 100%;
    max-width: 600px;
    max-height: 90vh;
    overflow-y: auto;
    padding: 32px;
    position: relative;
  }
  .nc-modal-close {
    position: absolute;
    top: 16px;
    left: 16px;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: var(--nc-bg);
    border: none;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }
  .nc-modal h2 {
    font-size: 24px;
    font-weight: 800;
    color: var(--nc-secondary);
    margin-bottom: 24px;
    text-align: center;
  }
  .nc-form-group {
    margin-bottom: 16px;
  }
  .nc-form-group label {
    display: block;
    font-size: 14px;
    font-weight: 600;
    color: var(--nc-secondary);
    margin-bottom: 6px;
  }
  .nc-form-group input,
  .nc-form-group select,
  .nc-form-group textarea {
    width: 100%;
    padding: 12px 16px;
    border: 2px solid var(--nc-border);
    border-radius: var(--nc-radius-sm);
    font-size: 14px;
    font-family: inherit;
    transition: var(--nc-transition);
  }
  .nc-form-group input:focus,
  .nc-form-group select:focus,
  .nc-form-group textarea:focus {
    outline: none;
    border-color: var(--nc-primary);
    box-shadow: 0 0 0 4px rgba(247,148,29,0.1);
  }
  .nc-form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }
  .nc-order-summary {
    background: var(--nc-bg);
    border-radius: var(--nc-radius-sm);
    padding: 20px;
    margin: 20px 0;
  }
  .nc-order-summary h4 {
    font-size: 16px;
    font-weight: 700;
    margin-bottom: 12px;
    color: var(--nc-secondary);
  }
  .nc-order-item {
    display: flex;
    justify-content: space-between;
    padding: 8px 0;
    font-size: 14px;
    border-bottom: 1px solid var(--nc-border);
  }
  .nc-order-item:last-child {
    border-bottom: none;
  }
  .nc-order-total {
    display: flex;
    justify-content: space-between;
    padding-top: 12px;
    margin-top: 12px;
    border-top: 2px solid var(--nc-border);
    font-size: 18px;
    font-weight: 800;
    color: var(--nc-secondary);
  }
  .nc-order-total span:last-child {
    color: var(--nc-primary);
  }
  .nc-submit-btn {
    width: 100%;
    padding: 16px;
    background: linear-gradient(135deg, var(--nc-primary), #ff9f43);
    color: white;
    border: none;
    border-radius: var(--nc-radius-sm);
    font-size: 16px;
    font-weight: 800;
    cursor: pointer;
    transition: var(--nc-transition);
    margin-top: 16px;
    font-family: inherit;
  }
  .nc-submit-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 20px rgba(247,148,29,0.3);
  }

  /* Success Modal */
  .nc-success-icon {
    width: 80px;
    height: 80px;
    background: linear-gradient(135deg, var(--nc-success), #2ecc71);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-size: 40px;
    margin: 0 auto 20px;
  }
  .nc-success-text {
    text-align: center;
  }
  .nc-success-text h3 {
    font-size: 22px;
    font-weight: 800;
    color: var(--nc-secondary);
    margin-bottom: 8px;
  }
  .nc-success-text p {
    color: var(--nc-text-light);
    margin-bottom: 20px;
  }
  .nc-order-number {
    background: var(--nc-bg);
    padding: 12px 24px;
    border-radius: var(--nc-radius-sm);
    font-size: 18px;
    font-weight: 800;
    color: var(--nc-primary);
    text-align: center;
    margin-bottom: 20px;
    border: 2px dashed var(--nc-primary);
  }

  /* Loading */
  .nc-loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 60vh;
    gap: 20px;
  }
  .nc-spinner {
    width: 50px;
    height: 50px;
    border: 4px solid var(--nc-border);
    border-top-color: var(--nc-primary);
    border-radius: 50%;
    animation: nc-spin 1s linear infinite;
  }
  @keyframes nc-spin {
    to { transform: rotate(360deg); }
  }

  /* Responsive */
  @media (max-width: 1024px) {
    .nc-hero-inner { grid-template-columns: 1fr; text-align: center; }
    .nc-hero-text h1 { font-size: 36px; }
    .nc-features-grid { grid-template-columns: repeat(2, 1fr); }
    .nc-footer-inner { grid-template-columns: 1fr 1fr; }
  }
  @media (max-width: 768px) {
    .nc-header-inner { flex-wrap: wrap; }
    .nc-search-box { order: 3; max-width: 100%; width: 100%; }
    .nc-hero { padding: 50px 0; }
    .nc-hero-text h1 { font-size: 28px; }
    .nc-features-grid { grid-template-columns: 1fr; }
    .nc-footer-inner { grid-template-columns: 1fr; }
    .nc-products-grid { grid-template-columns: repeat(2, 1fr); gap: 16px; }
    .nc-product-image { height: 180px; }
    .nc-categories-grid { grid-template-columns: repeat(2, 1fr); }
    .nc-form-row { grid-template-columns: 1fr; }
  }
  @media (max-width: 480px) {
    .nc-products-grid { grid-template-columns: 1fr; }
  }
`;

// ─── Wilayas Data ───
const WILAYAS = [
  { id: '16', name: 'الجزائر العاصمة' },
  { id: '31', name: 'وهران' },
  { id: '25', name: 'قسنطينة' },
  { id: '9', name: 'بليدة' },
  { id: '15', name: 'تيزي وزو' },
  { id: '26', name: 'المدية' },
  { id: '6', name: 'بجاية' },
  { id: '23', name: 'عنابة' },
  { id: '19', name: 'سطيف' },
  { id: '22', name: 'سيدي بلعباس' },
];

export default function PublicStorePage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [store, setStore] = useState(null);
  const [products, setProducts] = useState([]);
  const [families, setFamilies] = useState([]);
  const [productsByFamily, setProductsByFamily] = useState({});
  const [cart, setCart] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFamily, setSelectedFamily] = useState(null);
  const [showCart, setShowCart] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const [customerInfo, setCustomerInfo] = useState({
    name: '', phone: '', email: '', wilaya: '', commune: '', address: '', notes: ''
  });

  // Load cart from localStorage
  useEffect(() => {
    fetchStore();
    const saved = localStorage.getItem(`cart_${slug}`);
    if (saved) {
      try { setCart(JSON.parse(saved)); } catch (e) {}
    }
  }, [slug]);

  useEffect(() => {
    localStorage.setItem(`cart_${slug}`, JSON.stringify(cart));
  }, [cart, slug]);

  const fetchStore = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get(`/shop/${slug}`);
      const data = response.data;
      setStore(data.settings);
      setProducts(Array.isArray(data.products) ? data.products : []);
      setFamilies(Array.isArray(data.families) ? data.families : []);
      setProductsByFamily(data.products_by_family || {});
    } catch (error) {
      console.error('Error fetching store:', error);
      toast.error('تعذر تحميل المتجر');
    } finally {
      setLoading(false);
    }
  };

  const addToCart = (product) => {
    const existing = cart.find(item => item.product_id === product.id);
    if (existing) {
      setCart(cart.map(item =>
        item.product_id === product.id
          ? { ...item, quantity: item.quantity + 1 }
          : item
      ));
    } else {
      setCart([...cart, {
        product_id: product.id,
        name: product.name_ar || product.name,
        price: product.retail_price || product.selling_price || 0,
        image_url: product.image_url,
        quantity: 1
      }]);
    }
    toast.success('تمت الإضافة للسلة');
  };

  const updateQty = (productId, delta) => {
    setCart(cart.map(item => {
      if (item.product_id === productId) {
        const newQty = item.quantity + delta;
        return newQty > 0 ? { ...item, quantity: newQty } : item;
      }
      return item;
    }).filter(item => item.quantity > 0));
  };

  const removeFromCart = (productId) => {
    setCart(cart.filter(item => item.product_id !== productId));
  };

  const cartTotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const handleSubmitOrder = async (e) => {
    e.preventDefault();
    if (cart.length === 0) return;
    setSubmitting(true);
    try {
      const orderData = {
        customer_name: customerInfo.name,
        customer_phone: customerInfo.phone,
        customer_email: customerInfo.email,
        delivery_address: customerInfo.address,
        delivery_city: customerInfo.commune,
        delivery_wilaya: customerInfo.wilaya,
        items: cart.map(item => ({
          product_id: item.product_id,
          name: item.name,
          quantity: item.quantity,
          price: item.price
        })),
        subtotal: cartTotal,
        total: cartTotal,
        notes: customerInfo.notes,
        payment_method: 'cod'
      };
      const response = await apiClient.post(`/shop/${slug}/order`, orderData);
      setOrderSuccess(response.data);
      setCart([]);
      localStorage.removeItem(`cart_${slug}`);
    } catch (error) {
      toast.error(error.response?.data?.detail || 'فشل إرسال الطلب');
    } finally {
      setSubmitting(false);
    }
  };

  const displayedProducts = selectedFamily
    ? (productsByFamily[selectedFamily]?.products || [])
    : (Array.isArray(products) ? products : []);

  const filteredProducts = searchQuery
    ? displayedProducts.filter(p => {
        const q = searchQuery.toLowerCase();
        return (p.name_ar?.toLowerCase().includes(q) || p.name_en?.toLowerCase().includes(q));
      })
    : displayedProducts;

  if (loading) {
    return (
      <div className="nouacer-store">
        <style>{themeStyles}</style>
        <div className="nc-loading">
          <div className="nc-spinner" />
          <p>جاري تحميل المتجر...</p>
        </div>
      </div>
    );
  }

  if (!store) {
    return (
      <div className="nouacer-store">
        <style>{themeStyles}</style>
        <div className="nc-loading">
          <div className="nc-cart-empty-icon">🏪</div>
          <h3>المتجر غير متوفر</h3>
          <p>هذا المتجر غير مفعل حالياً</p>
        </div>
      </div>
    );
  }

  return (
    <div className="nouacer-store">
      <style>{themeStyles}</style>
      <Toaster position="top-left" richColors />

      {/* ─── Top Bar ─── */}
      <div className="nc-top-bar">
        <div className="nc-top-bar-inner">
          <span>📞 {store.contact_phone || '0000000000'}</span>
          <span>🚚 توصيل لـ 58 ولاية | الدفع عند الاستلام</span>
        </div>
      </div>

      {/* ─── Header ─── */}
      <header className="nc-header">
        <div className="nc-header-inner">
          <Link to={`/shop/${slug}`} className="nc-logo">
            <div className="nc-logo-icon">🛍️</div>
            <span>{store.store_name || 'متجرنا'}</span>
          </Link>

          <div className="nc-search-box">
            <input
              type="text"
              placeholder="ابحث عن منتج..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <button className="nc-search-btn"><Search size={16} /></button>
          </div>

          <button className="nc-header-cart" onClick={() => setShowCart(true)}>
            <ShoppingCart size={20} />
            <span>السلة</span>
            {cartCount > 0 && <span className="nc-cart-count">{cartCount}</span>}
          </button>
        </div>
      </header>

      {/* ─── Hero ─── */}
      <section className="nc-hero">
        <div className="nc-hero-inner">
          <div className="nc-hero-text">
            <h1>
              {store.store_name || 'أفضل المنتجات'}
              <span>بأسعار منافسة</span>
            </h1>
            <p>{store.description || 'اكتشف مجموعتنا المميزة من المنتجات بجودة عالية وأسعار unbeatable'}</p>
            <div className="nc-hero-badges">
              <span className="nc-hero-badge"><Truck size={14} /> توصيل سريع</span>
              <span className="nc-hero-badge"><Shield size={14} /> ضمان الجودة</span>
              <span className="nc-hero-badge"><RefreshCw size={14} /> إرجاع سهل</span>
            </div>
          </div>
          <div>
            {store.banner_url ? (
              <img src={store.banner_url} alt="Banner" className="nc-hero-img" />
            ) : (
              <div style={{ fontSize: '120px', textAlign: 'center' }}>🛒</div>
            )}
          </div>
        </div>
      </section>

      {/* ─── Features ─── */}
      <section className="nc-features">
        <div className="nc-features-grid">
          <div className="nc-feature-item">
            <div className="nc-feature-icon">🚚</div>
            <div className="nc-feature-text">
              <h4>توصيل سريع</h4>
              <p>لجميع الولايات الجزائرية</p>
            </div>
          </div>
          <div className="nc-feature-item">
            <div className="nc-feature-icon">💰</div>
            <div className="nc-feature-text">
              <h4>الدفع عند الاستلام</h4>
              <p>ادفع لما تستلم طلبك</p>
            </div>
          </div>
          <div className="nc-feature-item">
            <div className="nc-feature-icon">🔄</div>
            <div className="nc-feature-text">
              <h4>إرجاع سهل</h4>
              <p>سياسة إرجاع مرنة</p>
            </div>
          </div>
          <div className="nc-feature-item">
            <div className="nc-feature-icon">📞</div>
            <div className="nc-feature-text">
              <h4>دعم 24/7</h4>
              <p>فريق جاهز لمساعدتك</p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Categories ─── */}
      {families.length > 0 && (
        <section className="nc-section">
          <div className="nc-section-inner">
            <div className="nc-section-header">
              <h2 className="nc-section-title">تصفح حسب الفئة</h2>
            </div>
            <div className="nc-categories-grid">
              <div
                className={`nc-category-card ${!selectedFamily ? 'active' : ''}`}
                onClick={() => setSelectedFamily(null)}
                style={{ background: !selectedFamily ? 'linear-gradient(135deg, #f7941d, #ff9f43)' : undefined }}
              >
                <div className="nc-category-overlay">
                  <div className="nc-category-icon">🏪</div>
                  <h3>جميع المنتجات</h3>
                  <span>{products.length} منتج</span>
                </div>
              </div>
              {families.map(family => {
                const count = productsByFamily[family.id]?.products?.length || 0;
                return (
                  <div
                    key={family.id}
                    className="nc-category-card"
                    onClick={() => setSelectedFamily(family.id)}
                  >
                    {family.image_url ? (
                      <img src={family.image_url} alt={family.name} />
                    ) : null}
                    <div className="nc-category-overlay">
                      <h3>{family.name_ar || family.name}</h3>
                      <span>{count} منتج</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      {/* ─── Products ─── */}
      <section className="nc-section" style={{ background: '#f8f9fa' }}>
        <div className="nc-section-inner">
          <div className="nc-section-header">
            <h2 className="nc-section-title">
              {selectedFamily
                ? (productsByFamily[selectedFamily]?.family?.name_ar || 'المنتجات')
                : 'جميع المنتجات'}
            </h2>
            {selectedFamily && (
              <button
                onClick={() => setSelectedFamily(null)}
                style={{ background: 'none', border: 'none', color: '#f7941d', cursor: 'pointer', fontWeight: 700 }}
              >
                عرض الكل ←
              </button>
            )}
          </div>

          {filteredProducts.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#636e72' }}>
              <div style={{ fontSize: '64px', marginBottom: '16px' }}>📭</div>
              <h3>لا توجد منتجات</h3>
              <p>جرب البحث بكلمات مختلفة</p>
            </div>
          ) : (
            <div className="nc-products-grid">
              {filteredProducts.map(product => (
                <Link key={product.id} to={`/shop/${slug}/product/${product.id}`} className="nc-product-card" style={{textDecoration:"none",color:"inherit"}}>
                  <div className="nc-product-image">
                    {product.image_url ? (
                      <img src={product.image_url} alt={product.name_ar} />
                    ) : (
                      <div className="nc-product-placeholder">📦</div>
                    )}
                    {product.quantity < 5 && product.quantity > 0 && (
                      <span className="nc-product-badge low-stock">كمية محدودة</span>
                    )}
                    {product.quantity <= 0 && (
                      <span className="nc-product-badge out-of-stock">نفذت الكمية</span>
                    )}
                    <div className="nc-product-actions">
                      <button className="nc-action-btn" title="أضف للمفضلة"><Heart size={18} /></button>
                      <button className="nc-action-btn" title="مشاركة"><Share2 size={18} /></button>
                    </div>
                  </div>
                  <div className="nc-product-info">
                    <h3 className="nc-product-title">{product.name_ar || product.name}</h3>
                    <div className="nc-product-price">
                      <span className="nc-price-current">
                        {(product.retail_price || product.selling_price || 0).toLocaleString()} دج
                      </span>
                      {product.purchase_price > 0 && (
                        <span className="nc-price-old">
                          {Math.round((product.retail_price || product.selling_price || 0) * 1.2).toLocaleString()} دج
                        </span>
                      )}
                    </div>
                    <button
                      className="nc-add-cart-btn"
                      onClick={() => navigate(`/shop/${slug}/product/${product.id}`)}
                      disabled={product.quantity <= 0}
                    >
                      {product.quantity > 0 ? (
                        <><ShoppingCart size={16} /> اطلب الآن</>
                      ) : (
                        'نفذت الكمية'
                      )}
                    </button>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ─── Footer ─── */}
      <footer className="nc-footer">
        <div className="nc-footer-inner">
          <div className="nc-footer-brand">
            <h3>
              <span style={{ fontSize: '32px' }}>🛍️</span>
              {store.store_name}
            </h3>
            <p>{store.description || 'متجر إلكتروني جزائري يقدم أفضل المنتجات بأسعار منافسة'}</p>
            <div className="nc-footer-contact">
              <span><Phone size={16} /> {store.contact_phone}</span>
              <span><MapPin size={16} /> {store.contact_address}</span>
              <span><Clock size={16} /> {store.working_hours}</span>
            </div>
          </div>
          <div>
            <h4>روابط سريعة</h4>
            <ul className="nc-footer-links">
              <li><Link to={`/shop/${slug}`}>الرئيسية</Link></li>
              <li><a href="#products">المنتجات</a></li>
              <li><a href="#about">من نحن</a></li>
              <li><a href="#contact">اتصل بنا</a></li>
            </ul>
          </div>
          <div>
            <h4>سياسات المتجر</h4>
            <ul className="nc-footer-links">
              <li><a href="#">شروط الاستخدام</a></li>
              <li><a href="#">سياسة الإرجاع</a></li>
              <li><a href="#">سياسة الخصوصية</a></li>
            </ul>
          </div>
          <div>
            <h4>تواصل معنا</h4>
            <ul className="nc-footer-links">
              <li><a href="#">واتساب</a></li>
              <li><a href="#">فيسبوك</a></li>
              <li><a href="#">إنستغرام</a></li>
            </ul>
          </div>
        </div>
        <div className="nc-footer-bottom">
          <p>© 2026 {store.store_name} — جميع الحقوق محفوظة | مدعوم بواسطة NT-Commerce</p>
        </div>
      </footer>

      {/* ─── Cart Sidebar ─── */}
      <div className={`nc-cart-overlay ${showCart ? 'active' : ''}`} onClick={() => setShowCart(false)} />
      <div className={`nc-cart-sidebar ${showCart ? 'active' : ''}`}>
        <div className="nc-cart-header">
          <h3><ShoppingCart size={20} /> سلة التسوق ({cartCount})</h3>
          <button className="nc-cart-close" onClick={() => setShowCart(false)}><X size={20} /></button>
        </div>
        <div className="nc-cart-items">
          {cart.length === 0 ? (
            <div className="nc-cart-empty">
              <div className="nc-cart-empty-icon">🛒</div>
              <h4>السلة فارغة</h4>
              <p>أضف منتجات للبدء</p>
            </div>
          ) : (
            cart.map(item => (
              <div key={item.product_id} className="nc-cart-item">
                <div className="nc-cart-item-img">
                  {item.image_url ? <img src={item.image_url} alt={item.name} /> : <span>📦</span>}
                </div>
                <div className="nc-cart-item-info">
                  <h4>{item.name}</h4>
                  <div className="nc-cart-item-price">{(item.price * item.quantity).toLocaleString()} دج</div>
                  <div className="nc-cart-item-qty">
                    <button className="nc-qty-btn" onClick={() => updateQty(item.product_id, -1)}><Minus size={14} /></button>
                    <span>{item.quantity}</span>
                    <button className="nc-qty-btn" onClick={() => updateQty(item.product_id, 1)}><Plus size={14} /></button>
                    <button className="nc-cart-item-remove" onClick={() => removeFromCart(item.product_id)}><Trash2 size={16} /></button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
        {cart.length > 0 && (
          <div className="nc-cart-footer">
            <div className="nc-cart-total">
              <span>الإجمالي:</span>
              <span>{cartTotal.toLocaleString()} دج</span>
            </div>
            <button className="nc-cart-checkout-btn" onClick={() => { setShowCart(false); setShowCheckout(true); }}>
              إتمام الطلب ←
            </button>
          </div>
        )}
      </div>

      {/* ─── Checkout Modal ─── */}
      <div className={`nc-modal-overlay ${showCheckout ? 'active' : ''}`} onClick={() => !submitting && setShowCheckout(false)}>
        <div className="nc-modal" onClick={e => e.stopPropagation()}>
          <button className="nc-modal-close" onClick={() => setShowCheckout(false)}><X size={20} /></button>

          {!orderSuccess ? (
            <>
              <h2>📝 إتمام الطلب</h2>
              <form onSubmit={handleSubmitOrder}>
                <div className="nc-form-row">
                  <div className="nc-form-group">
                    <label>الاسم الكامل *</label>
                    <input required value={customerInfo.name} onChange={e => setCustomerInfo({...customerInfo, name: e.target.value})} placeholder="أحمد بن علي" />
                  </div>
                  <div className="nc-form-group">
                    <label>رقم الهاتف *</label>
                    <input required type="tel" value={customerInfo.phone} onChange={e => setCustomerInfo({...customerInfo, phone: e.target.value})} placeholder="0555123456" />
                  </div>
                </div>
                <div className="nc-form-group">
                  <label>البريد الإلكتروني</label>
                  <input type="email" value={customerInfo.email} onChange={e => setCustomerInfo({...customerInfo, email: e.target.value})} placeholder="email@example.com" />
                </div>
                <div className="nc-form-row">
                  <div className="nc-form-group">
                    <label>الولاية *</label>
                    <select required value={customerInfo.wilaya} onChange={e => setCustomerInfo({...customerInfo, wilaya: e.target.value})}>
                      <option value="">اختر الولاية</option>
                      {WILAYAS.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                  </div>
                  <div className="nc-form-group">
                    <label>البلدية *</label>
                    <input required value={customerInfo.commune} onChange={e => setCustomerInfo({...customerInfo, commune: e.target.value})} placeholder="باب الزوار" />
                  </div>
                </div>
                <div className="nc-form-group">
                  <label>العنوان التفصيلي *</label>
                  <input required value={customerInfo.address} onChange={e => setCustomerInfo({...customerInfo, address: e.target.value})} placeholder="حي ..., شارع ..., عمارة ..." />
                </div>
                <div className="nc-form-group">
                  <label>ملاحظات</label>
                  <textarea rows={3} value={customerInfo.notes} onChange={e => setCustomerInfo({...customerInfo, notes: e.target.value})} placeholder="أي ملاحظات خاصة..." />
                </div>

                <div className="nc-order-summary">
                  <h4>📦 ملخص الطلب</h4>
                  {cart.map(item => (
                    <div key={item.product_id} className="nc-order-item">
                      <span>{item.name} × {item.quantity}</span>
                      <span>{(item.price * item.quantity).toLocaleString()} دج</span>
                    </div>
                  ))}
                  <div className="nc-order-total">
                    <span>الإجمالي:</span>
                    <span>{cartTotal.toLocaleString()} دج</span>
                  </div>
                </div>

                <button type="submit" className="nc-submit-btn" disabled={submitting}>
                  {submitting ? '⏳ جاري الإرسال...' : '✅ تأكيد الطلب (الدفع عند الاستلام)'}
                </button>
              </form>
            </>
          ) : (
            <div className="nc-success-text">
              <div className="nc-success-icon"><CheckCircle size={40} /></div>
              <h3>تم استلام طلبك بنجاح! 🎉</h3>
              <p>سنتواصل معك قريباً لتأكيد الطلب</p>
              <div className="nc-order-number">رقم الطلب: {orderSuccess.order_number}</div>
              <button className="nc-submit-btn" onClick={() => { setShowCheckout(false); setOrderSuccess(null); }}>
                متابعة التسوق
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

